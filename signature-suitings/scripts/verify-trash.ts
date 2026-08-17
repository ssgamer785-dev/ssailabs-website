/**
 * TRASH / SOFT-DELETE REGRESSION SUITE — TESTS A..P
 * Runs the application's real db.ts over real HTTP against PostgREST + PostgreSQL
 * carrying the production schema plus migration v3. Nothing mocked but localStorage.
 */
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  get length() { return this.m.size; }
  wipe() { this.m.clear(); }
}
const store = new MemStore();
(globalThis as any).localStorage = store;
(globalThis as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
(globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");

let pass = 0, fail = 0;
const ck = (n: string, c: boolean, d = "") => {
  console.log(c ? `  PASS  ${n}` : `  FAIL  ${n}${d ? "  -- " + d : ""}`);
  c ? pass++ : fail++;
};
const sec = (t: string) => console.log(`\n--- ${t} ---`);

async function main() {
  const { supabase } = await import("../src/supabase.ts");
  const mod = await import("../src/db.ts");
  const db = mod.db;
  const raw = async (t: string) => {
    const { data, error } = await supabase.from(t).select("*") as any;
    if (error) throw new Error(`${t}: ${error.message}`);
    return data || [];
  };

  await db.waitForSync();
  while ((db as any).isSyncing) await new Promise(r => setTimeout(r, 50));
  db.setCurrentActor("Hardik Nagpal", "Admin");

  sec("Seed: customer with measurement, order, bill and payment");
  const cust = db.addCustomer({ fullName: "Gurpreet Singh", mobileNumber: "9812345678", address: "17 Model Town", preferredFabricBrands: [] } as any);
  const meas = db.saveMeasurement({
    customerId: cust.id, tryOnDate: "2026-09-01", deliveryDate: "2026-09-10",
    coatIndoWestern: { chest: "40" } as any, pent: { waist: "34", length: "40" } as any,
    vest: {} as any, shirtKurta: {} as any, designNotes: "", fabricSelected: "", liningChoice: "", remarks: "", createdBy: "T"
  } as any);
  const order = db.addOrder({
    customerId: cust.id, garmentTypes: ["Coat", "Pent"], garmentLineItems: [],
    linkedMeasurementVersionId: meas.id, fabricDetails: "Raymond", expectedDeliveryDate: "2026-09-20",
    status: "Pending", notes: "rush"
  } as any, 24000, 8000);
  const invoice = db.getInvoiceByOrderId(order.id)!;
  db.recordPayment(invoice.id, 6000, "UPI", "Counter");
  await db.waitForSync();

  const baseline = {
    customers: (await raw("customers")).length,
    orders: (await raw("orders")).length,
    invoices: (await raw("invoices")).length,
    measurements: (await raw("measurements")).length
  };
  ck("seed present in the database", baseline.customers === 1 && baseline.orders === 1);

  sec("TEST A — delete customer, disappears from active Customers");
  const del = await db.deleteCustomer(cust.id, { force: true });
  ck("delete reports success", del.success === true, del.error || "");
  ck("delete confirmed against the cloud", del.cloudVerified === true);
  ck("customer gone from active list", db.getCustomerById(cust.id) === undefined);
  ck("customer row removed from its table", (await raw("customers")).length === 0);
  ck("order row removed too", (await raw("orders")).length === 0);
  ck("measurement row removed too", (await raw("measurements")).length === 0);
  ck("invoice row removed too", (await raw("invoices")).length === 0);

  sec("TEST B — deleted customer appears in Trash");
  const binRows = await raw("trash");
  ck("bin has the whole deletion group in Supabase", binRows.length === 4, `got ${binRows.length}`);
  const groups = db.getTrashGroups();
  ck("Trash shows exactly one deletion", groups.length === 1, String(groups.length));
  ck("group headline is the customer", groups[0]?.primary.displayName === "Gurpreet Singh", groups[0]?.primary.displayName);
  ck("group carries the related records", groups[0]?.related.length === 3, String(groups[0]?.related.length));
  ck("deletion attributed to the operator", groups[0]?.primary.deletedBy === "Hardik Nagpal", groups[0]?.primary.deletedBy);
  ck("original record id preserved", groups[0]?.primary.recordId === cust.id);
  ck("full payload snapshotted", groups[0]?.primary.payload?.mobileNumber === "9812345678");
  const batchIds = new Set(binRows.map((r: any) => r.batchId));
  ck("all four share one deletion batch", batchIds.size === 1, String(batchIds.size));

  sec("TEST L — deleted records do not affect statistics");
  ck("Total Customers excludes binned", db.getCustomers().length === 0);
  ck("Active Orders excludes binned", db.getOrders().filter((o: any) => o.status !== "Delivered").length === 0);
  const receivables = db.getInvoices().reduce((s: number, i: any) => s + (i.balanceDue > 0 ? i.balanceDue : 0), 0);
  ck("Pending Receivables excludes binned", receivables === 0, String(receivables));
  ck("measurements list excludes binned", db.getAllMeasurements().length === 0);
  ck("appointments list excludes binned", db.getAppointments().length === 0);

  sec("TEST M — six-month retention, computed by the database");
  const serverDeletedAt = binRows[0].deleted_at;
  ck("deleted_at written by the database", Boolean(serverDeletedAt));
  const ageMs = Date.now() - new Date(serverDeletedAt).getTime();
  ck("deleted_at is now, not a client-supplied value", ageMs >= 0 && ageMs < 5 * 60 * 1000, `${Math.round(ageMs / 1000)}s`);
  ck("retention window is 180 days", mod.TRASH_RETENTION_DAYS === 180);
  ck("group shows ~180 days remaining", groups[0]?.daysRemaining >= 179 && groups[0]?.daysRemaining <= 180, String(groups[0]?.daysRemaining));
  ck("not eligible for purge", groups[0]?.eligibleForPurge === false);
  const purge = await db.purgeExpiredTrash();
  ck("purge runs but removes nothing this early", purge.success === true && purge.purged === 0, JSON.stringify(purge));
  ck("bin untouched by the purge", (await raw("trash")).length === 4, String((await raw("trash")).length));

  sec("TEST C — refresh: customer stays in Trash");
  const spec1 = "../src/db.ts?trash=1";
  const mod2: any = await import(spec1); const db2 = mod2.db;
  await db2.waitForSync();
  while ((db2 as any).isSyncing) await new Promise(r => setTimeout(r, 50));
  await db2.refreshTrashFromCloud();
  db2.setCurrentActor("Hardik Nagpal", "Admin");
  ck("after refresh the bin still holds the group", db2.getTrashGroups().length === 1, String(db2.getTrashGroups().length));
  ck("after refresh the customer is still not active", db2.getCustomerById(cust.id) === undefined);

  sec("TEST D + H + O — restore customer with related records");
  const batchId = db2.getTrashGroups()[0].batchId;
  const restored = await db2.restoreFromTrash(batchId, { relatedRecords: true });
  ck("restore reports success", restored.success === true, restored.error || "");
  ck("restore confirmed against the cloud", restored.cloudVerified === true);
  ck("all four records restored", restored.affected === 4, String(restored.affected));
  ck("customer back in Supabase", (await raw("customers")).length === 1);
  ck("order back in Supabase", (await raw("orders")).length === 1);
  ck("measurement back in Supabase", (await raw("measurements")).length === 1);
  ck("invoice back in Supabase", (await raw("invoices")).length === 1);
  ck("customer id unchanged", (await raw("customers"))[0].id === cust.id);
  ck("order still linked to the customer", (await raw("orders"))[0].customerId === cust.id);
  ck("order still linked to the measurement", (await raw("orders"))[0].linkedMeasurementVersionId === meas.id);
  ck("no orphaned order", (await raw("orders")).every((o: any) => o.customerId === cust.id));
  ck("payments survived the round trip", (await raw("invoices"))[0].payments?.length === 2,
    String((await raw("invoices"))[0].payments?.length));
  ck("balance intact", Number((await raw("invoices"))[0].balanceDue) === 10000,
    String((await raw("invoices"))[0].balanceDue));
  ck("bin is now empty", (await raw("trash")).length === 0, String((await raw("trash")).length));

  sec("TEST E + P — refresh after restore, Supabase is the authority");
  store.wipe(); // also proves it does not depend on the local cache
  const spec2 = "../src/db.ts?trash=2";
  const mod3: any = await import(spec2); const db3 = mod3.db;
  await db3.waitForSync();
  while ((db3 as any).isSyncing) await new Promise(r => setTimeout(r, 50));
  db3.setCurrentActor("Hardik Nagpal", "Admin");
  ck("restored customer present after refresh + cache wipe", Boolean(db3.getCustomerById(cust.id)));
  ck("restored order present", Boolean(db3.getOrderById(order.id)));
  ck("restored payments present", db3.getInvoiceByOrderId(order.id)?.payments.length === 2,
    String(db3.getInvoiceByOrderId(order.id)?.payments.length));
  ck("bin still empty after refresh", db3.getTrashGroups().length === 0);

  sec("TEST F + G — delete and restore an order on its own");
  const ordDel = await db3.deleteOrder(order.id, { force: true });
  ck("order delete succeeds", ordDel.success === true, ordDel.error || "");
  ck("order left the orders table", (await raw("orders")).length === 0);
  ck("customer untouched by the order delete", (await raw("customers")).length === 1);
  const ordGroups = db3.getTrashGroups();
  ck("order shows in Trash", ordGroups.length === 1 && ordGroups[0].primary.recordType === "orders");
  ck("its bill went with it", ordGroups[0].related.some((r: any) => r.recordType === "invoices"));
  const ordRestore = await db3.restoreFromTrash(ordGroups[0].batchId, { relatedRecords: true });
  ck("order restore succeeds", ordRestore.success === true, ordRestore.error || "");
  ck("order back with the same id", (await raw("orders"))[0]?.id === order.id);
  ck("order still linked to its customer", (await raw("orders"))[0]?.customerId === cust.id);
  ck("bill restored with payments", (await raw("invoices"))[0]?.payments?.length === 2);
  ck("no orphan left behind", (await raw("trash")).length === 0);

  sec("TEST I + J — backup carries the bin, and import restores it");
  await db3.deleteOrder(order.id, { force: true });
  await db3.waitForSync();
  ck("something is in the bin to back up", db3.getTrashGroups().length === 1);
  const backup = db3.getBackupData();
  ck("backup includes a trash section", Array.isArray((backup as any).trash), typeof (backup as any).trash);
  ck("backup carries every binned record", (backup as any).trash.length === 2, String((backup as any).trash.length));
  ck("backup keeps deletion metadata", Boolean((backup as any).trash[0].batchId) && Boolean((backup as any).trash[0].deleted_at));
  ck("backup keeps active customer too", backup.customers.length === 1);

  const restoreRes = await db3.restoreBackupData(JSON.parse(JSON.stringify(backup)));
  ck("backup import succeeds", restoreRes.success === true, restoreRes.error || "");
  ck("backup import confirmed against the cloud", restoreRes.cloudVerified === true);
  ck("active customer still present after import", (await raw("customers")).length === 1);
  ck("bin contents survived the import", db3.getTrashGroups().length === 1, String(db3.getTrashGroups().length));

  sec("TEST K — permanent delete removes it for good");
  const permBatch = db3.getTrashGroups()[0].batchId;
  const perm = await db3.permanentlyDelete(permBatch);
  ck("permanent delete succeeds", perm.success === true, perm.error || "");
  ck("gone from the bin in Supabase", (await raw("trash")).length === 0, String((await raw("trash")).length));
  ck("gone from the Trash screen", db3.getTrashGroups().length === 0);
  ck("order did NOT come back to the active table", (await raw("orders")).length === 0);
  const permAgain = await db3.permanentlyDelete(permBatch);
  ck("permanently deleting twice is refused safely", permAgain.success === false);

  sec("Audit trail");
  const audit = await db3.getAuditLog(50);
  ck("audit recorded the deletes", audit.some((a: any) => a.action === "delete"));
  ck("audit recorded the restores", audit.some((a: any) => a.action === "restore"));
  ck("audit recorded the permanent delete", audit.some((a: any) => a.action === "permanent_delete"));
  ck("audit names the operator", audit.every((a: any) => a.action === "purge" || a.actorName === "Hardik Nagpal"));
  ck("audit records the role", audit.some((a: any) => a.actorRole === "Admin"));

  console.log(`\n================ TRASH SUITE: ${pass} passed, ${fail} failed ================`);
  try { db.unsubscribeRealtime(); db2.unsubscribeRealtime(); db3.unsubscribeRealtime(); } catch {}
  process.exit(fail > 0 ? 1 : 0);
}

const guard = setTimeout(() => { console.error("TRASH SUITE TIMEOUT"); process.exit(2); }, 240000);
guard.unref?.();
main().catch(e => { console.error("CRASH:", e); process.exit(1); });
