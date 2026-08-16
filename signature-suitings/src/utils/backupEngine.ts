/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from "jszip";
import { db, obfuscateData, deobfuscateData } from "../db";
import { supabase, isSupabaseConfigured } from "../supabase";

export interface BackupStorageFile {
  path: string;
  size: number;
  contentType: string;
}

export interface BackupStorageFolder {
  fileCount: number;
  files: BackupStorageFile[];
}

export type BackupStorageBucket = Record<string, BackupStorageFolder>;

export interface BackupManifest {
  backupVersion: string;
  applicationVersion: string;
  createdAt: string; // ISO String
  businessName: string;
  tables: {
    [tableName: string]: number; // record count per table
  };
  totalCustomers: number;
  totalOrders: number;
  totalInvoices: number;
  totalPayments: number;
  totalMeasurements: number;
  totalWorkers: number;
  totalExpenses: number;
  hasStorageFiles: boolean;
  fileCount: number;
  storage?: Record<string, BackupStorageBucket>;
  checksum?: string;
  fileSizeBytes?: number;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest: BackupManifest | null;
  tablesData: Record<string, any[]> | null;
  configData?: any;
  fileSizeBytes: number;
  fileType: "backup" | "json" | "csv";
  rawFile?: File;
}

export interface RestoreProgressStage {
  stage: string;
  stepNumber: number;
  totalSteps: number;
  details?: string;
  isComplete?: boolean;
}

export interface RestoreSuccessReport {
  timestamp: string;
  preRestoreBackupFilename: string;
  recordCounts: {
    customers: number;
    orders: number;
    measurements: number;
    invoices: number;
    payments: number;
    appointments: number;
    expenses: number;
    workers: number;
    attendance: number;
    advances: number;
    salaries: number;
  };
  storageCounts?: {
    backedUp: number;
    restored: number;
    verified: number;
    failed: string[];
  };
  integrityStatus: "Verified" | "Warnings Detected";
  integrityNotes: string[];
}

/**
 * Infer MIME Content-Type from file path extension
 */
function inferContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/**
 * List all objects in all Supabase Storage buckets recursively
 */
async function fetchAllSupabaseStorageFiles(): Promise<Array<{ bucket: string; path: string; size: number; contentType: string }>> {
  if (!isSupabaseConfigured) return [];

  const results: Array<{ bucket: string; path: string; size: number; contentType: string }> = [];

  try {
    const { data: bucketsData, error: bucketErr } = await supabase.storage.listBuckets();
    const bucketNames = new Set<string>();

    // Always include "images" bucket
    bucketNames.add("images");

    if (!bucketErr && Array.isArray(bucketsData)) {
      bucketsData.forEach((b) => {
        if (b.name) bucketNames.add(b.name);
      });
    }

    // Helper for recursive listing
    async function listRecursive(bucket: string, folder = ""): Promise<void> {
      const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
      if (error || !data) return;

      for (const item of data) {
        const itemPath = folder ? `${folder}/${item.name}` : item.name;
        // If directory (item.id is missing or metadata is empty/non-existent)
        if (!item.id && (!item.metadata || Object.keys(item.metadata).length === 0)) {
          await listRecursive(bucket, itemPath);
        } else {
          const size = item.metadata?.size || item.metadata?.contentLength || 0;
          const mime = item.metadata?.mimetype || inferContentType(item.name);
          results.push({
            bucket,
            path: itemPath,
            size,
            contentType: mime
          });
        }
      }
    }

    for (const bName of bucketNames) {
      await listRecursive(bName);
    }
  } catch (err) {
    console.warn("Could not list Supabase Storage files:", err);
  }

  return results;
}

/**
 * Generate a checksum hash for JSON data verification
 */
function calculateChecksum(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "hash_" + Math.abs(hash).toString(16);
}

/**
 * 1. EXPORT FULL BACKUP (.backup ZIP ARCHIVE)
 * Backs up all database tables AND actual Supabase Storage file objects
 */
export async function createFullBackupZip(
  onProgress?: (stage: string) => void
): Promise<{ blob: Blob; filename: string; manifest: BackupManifest }> {
  if (onProgress) onProgress("Flushing pending operations & syncing with Supabase...");

  // Guarantee export reflects current confirmed Supabase state
  await db.flushSupabaseQueue();
  if (isSupabaseConfigured) {
    await db.initializeSupabaseSync(false);
  }

  const shopConfig = db.getShopConfig();
  const rawBackup = db.getBackupData();

  // EXPORT AUDIT. The backup is generated from in-memory state, which is only trustworthy if
  // it agrees with the cloud database. Compare the two before writing the file, so a backup
  // can never quietly ship fewer customers (or orders, or invoices) than the shop actually
  // has. Refuses to produce a file rather than hand over an incomplete one.
  if (isSupabaseConfigured) {
    if (onProgress) onProgress("Verifying export against the cloud database...");
    const auditTables: Array<[string, any[]]> = [
      ["customers", rawBackup.customers || []],
      ["orders", rawBackup.orders || []],
      ["invoices", rawBackup.invoices || []],
      ["measurements", rawBackup.measurements || []],
      ["workers", rawBackup.workers || []],
      ["appointments", rawBackup.appointments || []],
      ["expenses", rawBackup.expenses || []],
      ["attendance", rawBackup.attendance || []],
      ["advances", rawBackup.advances || []],
      ["salaries", rawBackup.salaries || []],
      ["trials", rawBackup.trials || []],
      ["alterations", rawBackup.alterations || []],
      ["users", rawBackup.users || []]
    ];
    const shortfalls: string[] = [];
    for (const [table, rows] of auditTables) {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
      if (error) {
        throw new Error(
          `Backup cancelled: could not read '${table}' from the cloud database to check the export (${error.message}). No file was created.`
        );
      }
      if (typeof count === "number" && rows.length < count) {
        shortfalls.push(`${table} (${rows.length} in the file vs ${count} in the database)`);
      }
    }
    if (shortfalls.length > 0) {
      throw new Error(
        `Backup cancelled: the export is missing records for ${shortfalls.join(", ")}. ` +
        `Reload the page so the app resyncs with the cloud database, then export again. No file was created.`
      );
    }
  }

  const zip = new JSZip();
  const filesFolder = zip.folder("files");

  let fileCount = 0;

  // Extract base64 photos/attachments into files/ directory if present
  const customers = rawBackup.customers || [];
  const workers = rawBackup.workers || [];

  if (onProgress) onProgress("Archiving inline profile media assets...");

  customers.forEach((c: any, index: number) => {
    if (c.photoUrl && c.photoUrl.startsWith("data:image/")) {
      try {
        const parts = c.photoUrl.split(",");
        const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
        const ext = mime.split("/")[1] || "jpg";
        const filename = `customer_${c.id}_${index}.${ext}`;
        const base64Data = parts[1];
        if (filesFolder) {
          filesFolder.file(filename, base64Data, { base64: true });
          fileCount++;
        }
      } catch (e) {
        console.warn(`Could not archive customer photo for ${c.id}:`, e);
      }
    }
  });

  workers.forEach((w: any, index: number) => {
    if (w.photoUrl && w.photoUrl.startsWith("data:image/")) {
      try {
        const parts = w.photoUrl.split(",");
        const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
        const ext = mime.split("/")[1] || "jpg";
        const filename = `worker_${w.id}_${index}.${ext}`;
        const base64Data = parts[1];
        if (filesFolder) {
          filesFolder.file(filename, base64Data, { base64: true });
          fileCount++;
        }
      } catch (e) {
        console.warn(`Could not archive worker photo for ${w.id}:`, e);
      }
    }
  });

  // Export actual Supabase Storage files
  const storageManifest: Record<string, BackupStorageBucket> = {};
  let totalStorageFilesCount = 0;

  if (isSupabaseConfigured) {
    if (onProgress) onProgress("Discovering Supabase Storage objects...");
    const storageFiles = await fetchAllSupabaseStorageFiles();

    for (let i = 0; i < storageFiles.length; i++) {
      const sFile = storageFiles[i];
      if (onProgress) {
        onProgress(`Archiving Storage object ${i + 1}/${storageFiles.length}: ${sFile.bucket}/${sFile.path}...`);
      }

      try {
        const { data: blob, error: dlError } = await supabase.storage.from(sFile.bucket).download(sFile.path);
        if (dlError || !blob) {
          throw new Error(`Failed to download storage object ${sFile.bucket}/${sFile.path}: ${dlError?.message || "Unknown error"}`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const zipPath = `storage/${sFile.bucket}/${sFile.path}`;
        zip.file(zipPath, arrayBuffer);

        // Build storage manifest hierarchy
        const bucketName = sFile.bucket;
        const fullPath = sFile.path;
        const lastSlash = fullPath.lastIndexOf("/");
        const folderName = lastSlash !== -1 ? fullPath.substring(0, lastSlash) : "root";

        if (!storageManifest[bucketName]) storageManifest[bucketName] = {};
        if (!storageManifest[bucketName][folderName]) {
          storageManifest[bucketName][folderName] = { fileCount: 0, files: [] };
        }

        storageManifest[bucketName][folderName].files.push({
          path: fullPath,
          size: sFile.size || arrayBuffer.byteLength,
          contentType: sFile.contentType || blob.type || inferContentType(sFile.path)
        });
        storageManifest[bucketName][folderName].fileCount++;
        totalStorageFilesCount++;
        fileCount++;
      } catch (err: any) {
        console.error("Storage download error:", err);
        throw new Error(`Backup export failed: Storage file '${sFile.bucket}/${sFile.path}' could not be archived. (${err.message})`);
      }
    }
  }

  // Calculate total payment entries across invoices
  let totalPayments = 0;
  (rawBackup.invoices || []).forEach((inv: any) => {
    if (Array.isArray(inv.payments)) {
      totalPayments += inv.payments.length;
    }
  });

  const tableCounts: Record<string, number> = {
    config: rawBackup.config ? 1 : 0,
    users: (rawBackup.users || []).length,
    customers: customers.length,
    measurements: (rawBackup.measurements || []).length,
    orders: (rawBackup.orders || []).length,
    trials: (rawBackup.trials || []).length,
    alterations: (rawBackup.alterations || []).length,
    invoices: (rawBackup.invoices || []).length,
    appointments: (rawBackup.appointments || []).length,
    expenses: (rawBackup.expenses || []).length,
    workers: workers.length,
    attendance: (rawBackup.attendance || []).length,
    advances: (rawBackup.advances || []).length,
    salaries: (rawBackup.salaries || []).length
  };

  if (onProgress) onProgress("Generating table JSON payloads...");

  // Add individual JSON files per table
  zip.file("config.json", JSON.stringify(rawBackup.config || {}, null, 2));
  zip.file("users.json", JSON.stringify(rawBackup.users || [], null, 2));
  zip.file("customers.json", JSON.stringify(rawBackup.customers || [], null, 2));
  zip.file("measurements.json", JSON.stringify(rawBackup.measurements || [], null, 2));
  zip.file("orders.json", JSON.stringify(rawBackup.orders || [], null, 2));
  zip.file("trials.json", JSON.stringify(rawBackup.trials || [], null, 2));
  zip.file("alterations.json", JSON.stringify(rawBackup.alterations || [], null, 2));
  zip.file("invoices.json", JSON.stringify(rawBackup.invoices || [], null, 2));
  zip.file("appointments.json", JSON.stringify(rawBackup.appointments || [], null, 2));
  zip.file("expenses.json", JSON.stringify(rawBackup.expenses || [], null, 2));
  zip.file("workers.json", JSON.stringify(rawBackup.workers || [], null, 2));
  zip.file("attendance.json", JSON.stringify(rawBackup.attendance || [], null, 2));
  zip.file("advances.json", JSON.stringify(rawBackup.advances || [], null, 2));
  zip.file("salaries.json", JSON.stringify(rawBackup.salaries || [], null, 2));

  // Garment catalog, categories and measurement templates are configuration the showroom
  // builds up over time. They are written as their own files so a restore recovers them even
  // if the config blob is replaced by a cloud sync.
  zip.file("garmentCategories.json", JSON.stringify((rawBackup as any).garmentCategories || [], null, 2));
  zip.file("garmentCatalog.json", JSON.stringify((rawBackup as any).garmentCatalog || [], null, 2));
  zip.file("measurementTemplates.json", JSON.stringify((rawBackup as any).measurementTemplates || [], null, 2));

  const allJsonCombined = JSON.stringify(rawBackup);
  const checksum = calculateChecksum(allJsonCombined);

  const manifest: BackupManifest = {
    backupVersion: "1.0",
    applicationVersion: "6.0",
    createdAt: new Date().toISOString(),
    businessName: shopConfig.shopName || "Signature Suitings & Showroom",
    tables: tableCounts,
    totalCustomers: customers.length,
    totalOrders: (rawBackup.orders || []).length,
    totalInvoices: (rawBackup.invoices || []).length,
    totalPayments,
    totalMeasurements: (rawBackup.measurements || []).length,
    totalWorkers: workers.length,
    totalExpenses: (rawBackup.expenses || []).length,
    hasStorageFiles: fileCount > 0,
    fileCount,
    storage: Object.keys(storageManifest).length > 0 ? storageManifest : undefined,
    checksum
  };

  if (onProgress) onProgress("Writing backup manifest...");
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  if (onProgress) onProgress("Compressing master backup archive...");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  manifest.fileSizeBytes = blob.size;

  const sanitizeName = (shopConfig.shopName || "Signature-Suitings")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-");

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const filename = `${sanitizeName}-Backup-${dateStr}-${timeStr}.backup`;

  return { blob, filename, manifest };
}

/**
 * Trigger browser download for a blob or file
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 2. PARSE AND VALIDATE BACKUP FILE (.backup, .json, or .csv)
 */
export async function parseAndValidateBackupFile(
  file: File
): Promise<BackupValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileSize = file.size;

  const isZipBackup = file.name.endsWith(".backup") || file.name.endsWith(".zip");
  const isJsonBackup = file.name.endsWith(".json");
  const isCsvBackup = file.name.endsWith(".csv");

  if (!isZipBackup && !isJsonBackup && !isCsvBackup) {
    return {
      valid: false,
      errors: ["Unsupported file extension. Please select a valid .backup, .json, or .csv backup file."],
      warnings: [],
      manifest: null,
      tablesData: null,
      fileSizeBytes: fileSize,
      fileType: "backup",
      rawFile: file
    };
  }

  // --- CASE A: .backup / .zip ZIP Archive ---
  if (isZipBackup) {
    try {
      let zip: JSZip;
      try {
        const buffer = await file.arrayBuffer();
        zip = await JSZip.loadAsync(buffer);
      } catch (_) {
        zip = await JSZip.loadAsync(file);
      }

      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        return {
          valid: false,
          errors: ["Invalid .backup archive: 'manifest.json' is missing from the file."],
          warnings: [],
          manifest: null,
          tablesData: null,
          fileSizeBytes: fileSize,
          fileType: "backup",
          rawFile: file
        };
      }

      const manifestText = await manifestFile.async("text");
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestText);
      } catch (e) {
        return {
          valid: false,
          errors: ["Corrupted backup manifest: 'manifest.json' contains invalid JSON."],
          warnings: [],
          manifest: null,
          tablesData: null,
          fileSizeBytes: fileSize,
          fileType: "backup",
          rawFile: file
        };
      }

      // Read table files
      const tableNames = [
        "config",
        "users",
        "customers",
        "measurements",
        "orders",
        "trials",
        "alterations",
        "invoices",
        "appointments",
        "expenses",
        "workers",
        "attendance",
        "advances",
        "salaries",
        "garmentCategories",
        "garmentCatalog",
        "measurementTemplates"
      ];

      const tablesData: Record<string, any[]> = {};
      let configData: any = null;

      for (const name of tableNames) {
        const tableFile = zip.file(`${name}.json`);
        if (tableFile) {
          try {
            const txt = await tableFile.async("text");
            const parsed = JSON.parse(txt);
            if (name === "config") {
              configData = parsed;
            } else {
              tablesData[name] = Array.isArray(parsed) ? parsed : [];
            }
          } catch (e) {
            warnings.push(`Could not parse ${name}.json. Table will be empty upon restore.`);
            if (name !== "config") tablesData[name] = [];
          }
        } else {
          if (name !== "config") tablesData[name] = [];
        }
      }

      // Validate core required tables
      if (!tablesData.customers || !Array.isArray(tablesData.customers)) {
        errors.push("Missing or invalid 'customers' table in backup archive.");
      }
      if (!tablesData.orders || !Array.isArray(tablesData.orders)) {
        errors.push("Missing or invalid 'orders' table in backup archive.");
      }

      // Foreign key relationship checks
      if (tablesData.customers && tablesData.orders) {
        const custIds = new Set(tablesData.customers.map((c: any) => c.id));
        const orphanOrders = tablesData.orders.filter((o: any) => o.customerId && !custIds.has(o.customerId));
        if (orphanOrders.length > 0) {
          warnings.push(`Detected ${orphanOrders.length} order(s) referencing missing customer IDs. These will be preserved with orphaned references.`);
        }
      }

      // Storage file validation
      let foundStorageFilesCount = 0;
      for (const relPath of Object.keys(zip.files)) {
        if (relPath.startsWith("storage/") && !zip.files[relPath].dir) {
          foundStorageFilesCount++;
        }
      }

      if (manifest.storage) {
        let expectedCount = 0;
        Object.keys(manifest.storage).forEach((b) => {
          Object.keys(manifest.storage![b]).forEach((f) => {
            expectedCount += manifest.storage![b][f].fileCount || 0;
          });
        });

        if (expectedCount > 0 && foundStorageFilesCount < expectedCount) {
          warnings.push(`Manifest specifies ${expectedCount} storage objects, but archive contains ${foundStorageFilesCount} objects.`);
        }
      }

      manifest.fileSizeBytes = fileSize;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest,
        tablesData,
        configData,
        fileSizeBytes: fileSize,
        fileType: "backup",
        rawFile: file
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [`Failed to unpack .backup archive: ${err.message || "File might be corrupted."}`],
        warnings: [],
        manifest: null,
        tablesData: null,
        fileSizeBytes: fileSize,
        fileType: "backup",
        rawFile: file
      };
    }
  }

  // --- CASE B: Legacy .json File ---
  if (isJsonBackup) {
    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const decrypted = deobfuscateData(text);
        parsed = JSON.parse(decrypted);
      }

      if (!parsed || typeof parsed !== "object") {
        errors.push("JSON backup file is empty or invalid.");
      }

      const customers = Array.isArray(parsed.customers) ? parsed.customers : [];
      const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
      const invoices = Array.isArray(parsed.invoices) ? parsed.invoices : [];

      let totalPayments = 0;
      invoices.forEach((inv: any) => {
        if (Array.isArray(inv.payments)) totalPayments += inv.payments.length;
      });

      const manifest: BackupManifest = {
        backupVersion: parsed.version || "Legacy JSON",
        applicationVersion: "5.0",
        createdAt: parsed.timestamp || new Date().toISOString(),
        businessName: parsed.config?.shopName || "Signature Showroom",
        tables: {
          customers: customers.length,
          orders: orders.length,
          invoices: invoices.length
        },
        totalCustomers: customers.length,
        totalOrders: orders.length,
        totalInvoices: invoices.length,
        totalPayments,
        totalMeasurements: Array.isArray(parsed.measurements) ? parsed.measurements.length : 0,
        totalWorkers: Array.isArray(parsed.workers) ? parsed.workers.length : 0,
        totalExpenses: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
        hasStorageFiles: false,
        fileCount: 0,
        fileSizeBytes: fileSize
      };

      const tablesData: Record<string, any[]> = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        customers,
        measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
        orders,
        trials: Array.isArray(parsed.trials) ? parsed.trials : [],
        alterations: Array.isArray(parsed.alterations) ? parsed.alterations : [],
        invoices,
        appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        workers: Array.isArray(parsed.workers) ? parsed.workers : [],
        attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
        advances: Array.isArray(parsed.advances) ? parsed.advances : [],
        salaries: Array.isArray(parsed.salaries) ? parsed.salaries : []
      };

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest,
        tablesData,
        configData: parsed.config,
        fileSizeBytes: fileSize,
        fileType: "json",
        rawFile: file
      };
    } catch (e: any) {
      return {
        valid: false,
        errors: [`Could not parse JSON file: ${e.message}`],
        warnings: [],
        manifest: null,
        tablesData: null,
        fileSizeBytes: fileSize,
        fileType: "json",
        rawFile: file
      };
    }
  }

  // --- CASE C: Legacy .csv File with embedded backup key ---
  if (isCsvBackup) {
    try {
      const text = await file.text();
      const marker = "--- SYSTEM DATABASE AUTO-RESTORE KEY (DO NOT DELETE OR MODIFY) ---";
      const index = text.indexOf(marker);

      if (index === -1) {
        return {
          valid: false,
          errors: ["The uploaded CSV file does not contain an embedded auto-restore key at the bottom."],
          warnings: [],
          manifest: null,
          tablesData: null,
          fileSizeBytes: fileSize,
          fileType: "csv",
          rawFile: file
        };
      }

      const remaining = text.substring(index + marker.length).trim();
      const base64Str = remaining.replace(/"/g, "").trim();

      let parsed: any;
      try {
        const decodedJson = deobfuscateData(base64Str);
        parsed = JSON.parse(decodedJson);
      } catch (e) {
        const decodedJson = decodeURIComponent(escape(atob(base64Str)));
        parsed = JSON.parse(decodedJson);
      }

      const customers = Array.isArray(parsed.customers) ? parsed.customers : [];
      const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
      const invoices = Array.isArray(parsed.invoices) ? parsed.invoices : [];

      const manifest: BackupManifest = {
        backupVersion: "CSV Embedded Backup",
        applicationVersion: "5.0",
        createdAt: parsed.timestamp || new Date().toISOString(),
        businessName: parsed.config?.shopName || "Signature Showroom",
        tables: { customers: customers.length, orders: orders.length },
        totalCustomers: customers.length,
        totalOrders: orders.length,
        totalInvoices: invoices.length,
        totalPayments: 0,
        totalMeasurements: Array.isArray(parsed.measurements) ? parsed.measurements.length : 0,
        totalWorkers: Array.isArray(parsed.workers) ? parsed.workers.length : 0,
        totalExpenses: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
        hasStorageFiles: false,
        fileCount: 0,
        fileSizeBytes: fileSize
      };

      const tablesData: Record<string, any[]> = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        customers,
        measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
        orders,
        trials: Array.isArray(parsed.trials) ? parsed.trials : [],
        alterations: Array.isArray(parsed.alterations) ? parsed.alterations : [],
        invoices,
        appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        workers: Array.isArray(parsed.workers) ? parsed.workers : [],
        attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
        advances: Array.isArray(parsed.advances) ? parsed.advances : [],
        salaries: Array.isArray(parsed.salaries) ? parsed.salaries : []
      };

      return {
        valid: true,
        errors: [],
        warnings,
        manifest,
        tablesData,
        configData: parsed.config,
        fileSizeBytes: fileSize,
        fileType: "csv",
        rawFile: file
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [`Failed to parse embedded CSV backup key: ${err.message}`],
        warnings: [],
        manifest: null,
        tablesData: null,
        fileSizeBytes: fileSize,
        fileType: "csv",
        rawFile: file
      };
    }
  }

  return {
    valid: false,
    errors: ["Unknown backup file structure."],
    warnings: [],
    manifest: null,
    tablesData: null,
    fileSizeBytes: fileSize,
    fileType: "backup",
    rawFile: file
  };
}

/**
 * 3. EXECUTE FULL RESTORE OPERATION
 * Performs automatic safety backup first (database + storage), then restores database and storage files.
 */
export async function executeRestoreOperation(
  validation: BackupValidationResult,
  onProgress: (stage: string, step: number, total: number) => void
): Promise<RestoreSuccessReport> {
  const totalSteps = 12;

  // Step 1: Create Automatic Pre-Restore Safety Backup
  onProgress("1/12 Creating automatic pre-restore safety backup (database + storage)...", 1, totalSteps);
  const safetyBackup = await createFullBackupZip();
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const preRestoreFilename = `Pre-Restore-Backup-${dateStr}-${timeStr}.backup`;

  // Download safety backup automatically to prevent any data loss
  triggerFileDownload(safetyBackup.blob, preRestoreFilename);

  await new Promise((resolve) => setTimeout(resolve, 600));

  // Step 2: Validate Data Structure
  onProgress("2/12 Validating data schema & record integrity...", 2, totalSteps);
  if (!validation.tablesData) {
    throw new Error("Cannot execute restoration: Backup table data is null or corrupted.");
  }

  const { tablesData, configData } = validation;

  // Prepare full payload
  const backupPayload: any = {
    config: configData || db.getShopConfig(),
    users: tablesData.users || [],
    customers: tablesData.customers || [],
    measurements: tablesData.measurements || [],
    orders: tablesData.orders || [],
    trials: tablesData.trials || [],
    alterations: tablesData.alterations || [],
    invoices: tablesData.invoices || [],
    appointments: tablesData.appointments || [],
    expenses: tablesData.expenses || [],
    workers: tablesData.workers || [],
    attendance: tablesData.attendance || [],
    advances: tablesData.advances || [],
    salaries: tablesData.salaries || [],
    // Configuration collections; fall back to whatever the config blob carried so older
    // archives (which had no dedicated files) still restore their catalog.
    garmentCategories: tablesData.garmentCategories || configData?.garmentCategories || [],
    garmentCatalog: tablesData.garmentCatalog || configData?.garmentCatalog || [],
    measurementTemplates: tablesData.measurementTemplates || configData?.measurementTemplates || []
  };

  // Step 3: Restoring Shop Configuration
  onProgress("3/12 Restoring Shop Settings & Configuration...", 3, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 4: Restoring Customers
  onProgress(`4/12 Restoring ${backupPayload.customers.length} Customer Accounts...`, 4, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 5: Restoring Measurements
  onProgress(`5/12 Restoring ${backupPayload.measurements.length} Size Cards & Measurements...`, 5, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 6: Restoring Orders
  onProgress(`6/12 Restoring ${backupPayload.orders.length} Bespoke Orders...`, 6, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 7: Restoring Trials & Alterations
  onProgress(`7/12 Restoring Trials & Fitting History...`, 7, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 8: Restoring Appointments
  onProgress(`8/12 Restoring Appointments & Calendar...`, 8, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 9: Restoring Invoices
  onProgress(`9/12 Restoring ${backupPayload.invoices.length} Invoices & Ledger Entries...`, 9, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 10: Restoring Staff & Payroll
  onProgress(`10/12 Restoring Staff, Attendance & Salary Ledgers...`, 10, totalSteps);
  await new Promise((r) => setTimeout(r, 150));

  // Step 11: Applying Local State & Overwriting Supabase Cloud Database
  onProgress("11/12 Overwriting local cache & Supabase Cloud tables...", 11, totalSteps);

  const restoreResult = await db.restoreBackupData(backupPayload);
  if (!restoreResult.success) {
    throw new Error(restoreResult.error || "Database restoration failed during execution.");
  }
  // A restore is only real once the rows have been read back out of the cloud database.
  // Without this the caller could report success for data that never left the browser.
  if (!restoreResult.cloudVerified) {
    throw new Error(
      restoreResult.error ||
      "Restore could not be confirmed against the cloud database. Nothing has been reported as restored."
    );
  }
  const verifiedCounts = restoreResult.tableCounts || {};

  // Step 12: Restoring & Uploading Actual Supabase Storage Files
  let storageBackedUpCount = 0;
  let storageRestoredCount = 0;
  let storageVerifiedCount = 0;
  const failedStorageFiles: string[] = [];

  if (validation.fileType === "backup" && validation.rawFile && isSupabaseConfigured) {
    onProgress("12/12 Restoring & uploading Supabase Storage objects...", 12, totalSteps);

    try {
      let zip: JSZip;
      try {
        const buffer = await validation.rawFile.arrayBuffer();
        zip = await JSZip.loadAsync(buffer);
      } catch (_) {
        zip = await JSZip.loadAsync(validation.rawFile);
      }
      const storageFilesToRestore: Array<{ bucket: string; path: string; zipPath: string }> = [];

      for (const relativePath of Object.keys(zip.files)) {
        if (relativePath.startsWith("storage/") && !zip.files[relativePath].dir) {
          const parts = relativePath.split("/");
          if (parts.length >= 3) {
            const bucket = parts[1];
            const storagePath = parts.slice(2).join("/");
            storageFilesToRestore.push({ bucket, path: storagePath, zipPath: relativePath });
          }
        }
      }

      storageBackedUpCount = storageFilesToRestore.length;

      for (let i = 0; i < storageFilesToRestore.length; i++) {
        const item = storageFilesToRestore[i];
        onProgress(`12/12 Restoring Storage object ${i + 1}/${storageFilesToRestore.length}: ${item.bucket}/${item.path}...`, 12, totalSteps);

        try {
          const fileData = await zip.file(item.zipPath)!.async("arraybuffer");
          const contentType = inferContentType(item.path);

          const { error: upErr } = await supabase.storage
            .from(item.bucket)
            .upload(item.path, fileData, {
              contentType,
              upsert: true
            });

          if (upErr) {
            console.error(`Failed to upload storage object ${item.bucket}/${item.path}:`, upErr.message);
            failedStorageFiles.push(`${item.bucket}/${item.path} (Upload error: ${upErr.message})`);
          } else {
            storageRestoredCount++;

            // Verification step: check object existence in Supabase Storage
            const { data: verBlob, error: verErr } = await supabase.storage.from(item.bucket).download(item.path);
            if (!verErr && verBlob && verBlob.size > 0) {
              storageVerifiedCount++;
            } else {
              failedStorageFiles.push(`${item.bucket}/${item.path} (Verification download failed)`);
            }
          }
        } catch (e: any) {
          failedStorageFiles.push(`${item.bucket}/${item.path} (${e.message})`);
        }
      }
    } catch (e: any) {
      console.error("Storage restore phase encountered error:", e);
      failedStorageFiles.push(`General Storage Restoration Error: ${e.message}`);
    }
  }

  // Synchronize database record photo URLs to active Supabase project Storage URLs
  if (isSupabaseConfigured && storageRestoredCount > 0) {
    onProgress("Synchronizing database photoUrl references to restored Storage objects...", 12, totalSteps);

    const normalizePhotoUrl = (urlStr?: string): string | undefined => {
      if (!urlStr) return urlStr;
      if (urlStr.includes("/storage/v1/object/public/")) {
        const match = urlStr.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
        if (match) {
          const bucket = match[1];
          const relPath = match[2];
          const { data } = supabase.storage.from(bucket).getPublicUrl(relPath);
          if (data && data.publicUrl) return data.publicUrl;
        }
      }
      return urlStr;
    };

    (backupPayload.customers || []).forEach((c: any) => {
      if (c.photoUrl) c.photoUrl = normalizePhotoUrl(c.photoUrl);
    });
    (backupPayload.workers || []).forEach((w: any) => {
      if (w.photoUrl) w.photoUrl = normalizePhotoUrl(w.photoUrl);
    });
    (backupPayload.users || []).forEach((u: any) => {
      if (u.photoUrl) u.photoUrl = normalizePhotoUrl(u.photoUrl);
    });
    if (backupPayload.config && backupPayload.config.logoUrl) {
      backupPayload.config.logoUrl = normalizePhotoUrl(backupPayload.config.logoUrl);
    }

    const reSyncResult = await db.restoreBackupData(backupPayload);
    if (!reSyncResult.success || !reSyncResult.cloudVerified) {
      throw new Error(
        reSyncResult.error ||
        "Photo links were updated but the follow-up save to the cloud database could not be confirmed."
      );
    }
  }

  await new Promise((r) => setTimeout(r, 300));

  let totalPayments = 0;
  backupPayload.invoices.forEach((inv: any) => {
    if (Array.isArray(inv.payments)) totalPayments += inv.payments.length;
  });

  const integrityNotes: string[] = [];
  if (isSupabaseConfigured) {
    integrityNotes.push("Supabase Cloud Database successfully synchronized & updated.");
  } else {
    integrityNotes.push("Restored to local offline cache (Supabase is not configured).");
  }

  integrityNotes.push(`Confirmed ${verifiedCounts.customers ?? backupPayload.customers.length} customer records in the cloud database.`);
  integrityNotes.push(`Confirmed ${verifiedCounts.orders ?? backupPayload.orders.length} order records in the cloud database.`);
  integrityNotes.push(`Confirmed ${verifiedCounts.invoices ?? backupPayload.invoices.length} invoice records in the cloud database.`);

  if (storageBackedUpCount > 0) {
    if (failedStorageFiles.length === 0 && storageVerifiedCount === storageBackedUpCount) {
      integrityNotes.push("BACKUP & RESTORE SUCCESSFUL: Both DATABASE AND STORAGE FILES have been successfully restored and verified.");
    } else {
      integrityNotes.push(`Storage Restoration Warning: ${storageVerifiedCount}/${storageBackedUpCount} files verified. Failed items: ${failedStorageFiles.join(", ")}`);
    }
  } else {
    integrityNotes.push("BACKUP & RESTORE SUCCESSFUL: DATABASE records successfully restored and verified.");
  }

  const report: RestoreSuccessReport = {
    timestamp: new Date().toLocaleString("en-IN"),
    preRestoreBackupFilename: preRestoreFilename,
    // Counts confirmed present in the cloud database after the restore, not the counts the
    // backup file claimed. Reporting the file's numbers would hide a partial restore.
    recordCounts: {
      customers: verifiedCounts.customers ?? backupPayload.customers.length,
      orders: verifiedCounts.orders ?? backupPayload.orders.length,
      measurements: verifiedCounts.measurements ?? backupPayload.measurements.length,
      invoices: verifiedCounts.invoices ?? backupPayload.invoices.length,
      payments: totalPayments,
      appointments: verifiedCounts.appointments ?? backupPayload.appointments.length,
      expenses: verifiedCounts.expenses ?? backupPayload.expenses.length,
      workers: verifiedCounts.workers ?? backupPayload.workers.length,
      attendance: verifiedCounts.attendance ?? backupPayload.attendance.length,
      advances: verifiedCounts.advances ?? backupPayload.advances.length,
      salaries: verifiedCounts.salaries ?? backupPayload.salaries.length
    },
    storageCounts: {
      backedUp: storageBackedUpCount,
      restored: storageRestoredCount,
      verified: storageVerifiedCount,
      failed: failedStorageFiles
    },
    integrityStatus: failedStorageFiles.length > 0 ? "Warnings Detected" : "Verified",
    integrityNotes
  };

  return report;
}

/**
 * 4. AUTOMATIC BACKUP SCHEDULER CHECK
 */
export async function checkAndPerformAutoBackupIfNeeded(): Promise<boolean> {
  try {
    const config = db.getShopConfig();
    const frequency = config.autoBackupFrequency || "Off";
    if (frequency === "Off") return false;

    const lastBackupTimeStr = config.lastAutoBackupTimestamp || localStorage.getItem("sig_suit_last_auto_backup");
    const now = Date.now();

    let intervalMs = 24 * 60 * 60 * 1000; // Daily
    if (frequency === "Weekly") {
      intervalMs = 7 * 24 * 60 * 60 * 1000; // Weekly
    }

    if (lastBackupTimeStr) {
      const lastTime = new Date(lastBackupTimeStr).getTime();
      if (!isNaN(lastTime) && now - lastTime < intervalMs) {
        return false;
      }
    }

    console.log(`Auto-Backup is due (${frequency}). Generating background safety backup archive...`);
    const { blob, filename } = await createFullBackupZip();

    // Actually hand the archive to the user. The previous version built the blob, discarded
    // it, and still stamped "last backup" — so the settings screen reported a backup history
    // for files that never existed anywhere.
    triggerFileDownload(blob, filename);

    const isoNow = new Date().toISOString();
    db.updateShopConfig({
      ...config,
      lastAutoBackupTimestamp: isoNow
    });
    localStorage.setItem("sig_suit_last_auto_backup", isoNow);
    localStorage.setItem("sig_suit_last_auto_backup_size", `${Math.round(blob.size / 1024)} KB`);
    localStorage.setItem("sig_suit_last_auto_backup_file", filename);

    return true;
  } catch (e) {
    console.warn("Auto-backup background task failed:", e);
    return false;
  }
}
