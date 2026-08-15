// Runtime verification harness for the Signature Suitings data layer.
// Runs the REAL db.ts against an in-memory localStorage, with Supabase disabled,
// so we exercise the actual persistence/merge/delete logic rather than mocks.

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  get length() { return this.m.size; }
  snapshot() { return new Map(this.m); }
  restore(s: Map<string, string>) { this.m = new Map(s); }
}

const storage = new MemStorage();
(globalThis as any).localStorage = storage;
(globalThis as any).window = undefined;
(globalThis as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
(globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");

let pass = 0, fail = 0;
const results: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? " -- " + detail : ""}`); }
}

async function main() {
  const mod = await import("../src/db.ts");
  const db = mod.db;

  console.log("=== A. CLEAN START (no demo data) ===");
  check("starts with zero customers", db.getCustomers().length === 0, `got ${db.getCustomers().length}`);
  check("starts with zero orders", db.getOrders().length === 0, `got ${db.getOrders().length}`);
  check("starts with zero invoices", db.getInvoices().length === 0, `got ${db.getInvoices().length}`);
  check("no fake receivables", db.getCustomers().every((c: any) => c.outstandingBalance === 0));

  console.log("=== B. CUSTOMER CRUD + STABLE ID ===");
  const cust = db.addCustomer({ fullName: "Test Client", mobileNumber: "9998887770", preferredFabricBrands: [] } as any);
  const originalId = cust.id;
  db.updateCustomer(cust.id, { fullName: "Test Client Edited", address: "12 Mall Road" });
  const afterEdit = db.getCustomerById(originalId);
  check("edit keeps the same id", afterEdit?.id === originalId, `${afterEdit?.id} vs ${originalId}`);
  check("edit applied", afterEdit?.fullName === "Test Client Edited");
  check("edit did not duplicate", db.getCustomers().filter((c: any) => c.id === originalId).length === 1);

  console.log("=== C. ORDER -> INVOICE RELATIONSHIP ===");
  const order = db.addOrder({
    customerId: cust.id, garmentTypes: ["Coat"], garmentLineItems: [],
    linkedMeasurementVersionId: "", fabricDetails: "Raymond Wool",
    expectedDeliveryDate: "2026-09-01", status: "Pending", notes: ""
  } as any, 10000, 4000);
  const inv = db.getInvoiceByOrderId(order.id);
  check("order created", Boolean(order.id));
  check("invoice auto-linked to order", Boolean(inv) && inv!.linkedOrderId === order.id);
  check("invoice linked to same customer", inv!.customerId === cust.id);
  check("grand total correct", inv!.grandTotal === 10000, `got ${inv!.grandTotal}`);
  check("balance = total - paid", inv!.balanceDue === 6000, `got ${inv!.balanceDue}`);
  check("advance recorded as payment", inv!.payments.length === 1 && inv!.payments[0].amount === 4000);
  check("exactly one invoice for the order", db.getInvoices().filter((i: any) => i.linkedOrderId === order.id).length === 1);

  console.log("=== D. NO PHANTOM INVOICES ON RECALC ===");
  const invCountBefore = db.getInvoices().length;
  db.recalculateAllBalances(); db.recalculateAllBalances(); db.recalculateAllBalances();
  check("recalc creates no extra invoices", db.getInvoices().length === invCountBefore,
    `${invCountBefore} -> ${db.getInvoices().length}`);
  check("customer outstanding reflects invoice", db.getCustomerById(cust.id)!.outstandingBalance === 6000,
    `got ${db.getCustomerById(cust.id)!.outstandingBalance}`);

  console.log("=== E. STATUS CHANGE MUST NOT DESTROY BILLING ===");
  const invBefore = JSON.parse(JSON.stringify(db.getInvoiceByOrderId(order.id)));
  db.updateOrderStatus(order.id, "Stitching", "Tester");
  db.updateOrderStatus(order.id, "Ready", "Tester");
  const invAfter = db.getInvoiceByOrderId(order.id)!;
  check("payments survive status change", invAfter.payments.length === invBefore.payments.length,
    `${invBefore.payments.length} -> ${invAfter.payments.length}`);
  check("paid amount survives", invAfter.advancePaid === 4000, `got ${invAfter.advancePaid}`);
  check("grand total survives", invAfter.grandTotal === 10000, `got ${invAfter.grandTotal}`);
  check("balance still correct", invAfter.balanceDue === 6000, `got ${invAfter.balanceDue}`);
  check("no duplicate invoice after status changes",
    db.getInvoices().filter((i: any) => i.linkedOrderId === order.id).length === 1);
  check("status history recorded", db.getOrderById(order.id)!.statusHistory.length >= 3,
    `got ${db.getOrderById(order.id)!.statusHistory.length}`);

  console.log("=== F. PAYMENT RECORDING + GUARDS ===");
  db.recordPayment(invAfter.id, 2000, "UPI", "Counter");
  const invPaid = db.getInvoiceById(invAfter.id)!;
  check("partial payment applied", invPaid.advancePaid === 6000, `got ${invPaid.advancePaid}`);
  check("balance recalculated", invPaid.balanceDue === 4000, `got ${invPaid.balanceDue}`);
  check("status is Partially Paid", invPaid.paymentStatus === "Partially Paid", invPaid.paymentStatus);
  check("payment history has 2 entries", invPaid.payments.length === 2, `got ${invPaid.payments.length}`);
  let overpayBlocked = false;
  try { db.recordPayment(invPaid.id, 999999, "Cash", "Counter"); } catch { overpayBlocked = true; }
  check("overpayment rejected", overpayBlocked);
  let zeroBlocked = false;
  try { db.recordPayment(invPaid.id, 0, "Cash", "Counter"); } catch { zeroBlocked = true; }
  check("zero payment rejected", zeroBlocked);
  check("balance unchanged after rejected payments", db.getInvoiceById(invPaid.id)!.balanceDue === 4000);

  console.log("=== G. DELETE SAFETY ===");
  let custDeleteBlocked = false;
  try { db.deleteCustomer(cust.id); } catch { custDeleteBlocked = true; }
  check("customer with payments cannot be deleted", custDeleteBlocked);
  check("customer still present after blocked delete", Boolean(db.getCustomerById(cust.id)));
  const impact = db.getCustomerDeletionImpact(cust.id);
  check("impact reports orders", impact.orders === 1, `got ${impact.orders}`);
  check("impact reports payments", impact.recordedPayments === 2, `got ${impact.recordedPayments}`);
  check("impact marks unsafe", impact.safeToDelete === false);
  db.archiveCustomer(cust.id);
  check("archive keeps the record", Boolean(db.getCustomerById(cust.id)));
  check("archive flag set", db.isCustomerArchived(db.getCustomerById(cust.id)!));
  check("archive preserves invoice", Boolean(db.getInvoiceByOrderId(order.id)));

  let orderDeleteBlocked = false;
  try { db.deleteOrder(order.id); } catch { orderDeleteBlocked = true; }
  check("order with payments cannot be deleted casually", orderDeleteBlocked);
  check("order survives blocked delete", Boolean(db.getOrderById(order.id)));

  console.log("=== H. SAFE DELETE PATH + TOMBSTONE ===");
  const cust2 = db.addCustomer({ fullName: "Walk In", mobileNumber: "9111222333", preferredFabricBrands: [] } as any);
  const cust2Id = cust2.id;
  db.deleteCustomer(cust2Id);
  check("customer with no money is deleted", db.getCustomerById(cust2Id) === undefined);
  check("tombstone written", db.isDeleted("customers", cust2Id));

  console.log("=== I. REFRESH / RESTART SIMULATION ===");
  const persisted = storage.snapshot();
  // Query string forces a fresh module evaluation, simulating an application restart.
  // Held in a variable so TypeScript does not try to resolve it as a static specifier.
  const restartSpecifier = "../src/db.ts?reload=1";
  const mod2 = await import(restartSpecifier);
  const db2 = mod2.db;
  check("customer survives restart", Boolean(db2.getCustomerById(originalId)));
  check("edited name survives restart", db2.getCustomerById(originalId)!.fullName === "Test Client Edited");
  check("order survives restart", Boolean(db2.getOrderById(order.id)));
  check("invoice survives restart", Boolean(db2.getInvoiceByOrderId(order.id)));
  check("payments survive restart", db2.getInvoiceByOrderId(order.id)!.payments.length === 2,
    `got ${db2.getInvoiceByOrderId(order.id)!.payments.length}`);
  check("balance survives restart", db2.getInvoiceByOrderId(order.id)!.balanceDue === 4000);
  check("DELETED customer stays deleted after restart", db2.getCustomerById(cust2Id) === undefined);
  check("no demo data resurrected on restart", db2.getCustomers().every((c: any) => !String(c.id).startsWith("cust_test")));
  check("customer count stable across restart", db2.getCustomers().length === 1, `got ${db2.getCustomers().length}`);

  console.log("=== J. ATTENDANCE DEDUPLICATION ===");
  const worker = db2.addWorker({ name: "Tailor A", mobileNumber: "9000000001", role: "Tailor", monthlySalary: 18000, active: true, joiningDate: "2026-01-01" } as any);
  const r1 = db2.saveAttendance({ workerId: worker.id, date: "2026-08-15", status: "Present" } as any);
  const r2 = db2.saveAttendance({ workerId: worker.id, date: "2026-08-15", status: "Half Day" } as any);
  const dayRecs = db2.getAttendance().filter((r: any) => r.workerId === worker.id && r.date === "2026-08-15");
  check("one attendance record per worker/day", dayRecs.length === 1, `got ${dayRecs.length}`);
  check("attendance id is deterministic", r1.id === r2.id, `${r1.id} vs ${r2.id}`);
  check("attendance status updated in place", dayRecs[0].status === "Half Day", dayRecs[0].status);
  const bulk = await db2.saveBulkAttendance([
    { workerId: worker.id, date: "2026-08-15", status: "Present" },
    { workerId: worker.id, date: "2026-08-16", status: "Present" }
  ] as any);
  check("bulk save succeeds", bulk.success === true);
  check("bulk save did not duplicate the existing day",
    db2.getAttendance().filter((r: any) => r.workerId === worker.id && r.date === "2026-08-15").length === 1);

  console.log("=== K. WORKER DELETE SAFETY ===");
  db2.addAdvance({ workerId: worker.id, amount: 5000, date: "2026-08-10", notes: "" } as any);
  const wStatus = db2.getWorkerDeletionStatus(worker.id);
  check("worker with unpaid advance blocked from delete", wStatus.allowed === false);
  let wErr = false;
  try { db2.deleteWorker(worker.id); } catch { wErr = true; }
  check("deleteWorker throws for unsafe worker", wErr);
  db2.updateWorker(worker.id, { active: false });
  check("deactivation works instead", db2.getWorkers().find((w: any) => w.id === worker.id)?.active === false);
  check("attendance history preserved after deactivation",
    db2.getAttendance().filter((r: any) => r.workerId === worker.id).length === 2);

  console.log("=== L. LOCALSTORAGE-CLEAR SAFETY (cloud off) ===");
  const backup = db2.getBackupData();
  check("backup includes customers", Array.isArray(backup.customers) && backup.customers.length === 1);
  check("backup includes orders", backup.orders.length === 1);
  check("backup includes invoices", backup.invoices.length === 1);
  check("backup includes payments", backup.invoices[0].payments.length === 2);
  check("backup includes workers", backup.workers.length === 1);
  check("backup includes attendance", backup.attendance.length === 2);
  check("backup includes advances", backup.advances.length === 1);
  check("backup includes garment catalog", Array.isArray((backup as any).garmentCatalog) && (backup as any).garmentCatalog.length > 0);
  check("backup includes measurement templates", Array.isArray((backup as any).measurementTemplates) && (backup as any).measurementTemplates.length > 0);

  console.log("=== M. RESTORE FROM BACKUP ===");
  const restoreRes = await db2.restoreBackupData(JSON.parse(JSON.stringify(backup)));
  check("restore reports success", restoreRes.success === true, restoreRes.error || "");
  check("restore recovers customer", Boolean(db2.getCustomerById(originalId)));
  check("restore recovers order", Boolean(db2.getOrderById(order.id)));
  check("restore recovers payments", db2.getInvoiceByOrderId(order.id)!.payments.length === 2);
  check("restore recovers catalog", db2.getGarmentCatalog().length > 0);
  check("restore does not duplicate customers", db2.getCustomers().length === 1, `got ${db2.getCustomers().length}`);
  check("restore does not duplicate invoices", db2.getInvoices().length === 1, `got ${db2.getInvoices().length}`);


  console.log("=== N. UNIQUE-COLUMN COLLISION GUARDS (regression) ===");
  // customers.qrCodeId, orders.orderNumber and invoices.invoiceNumber are UNIQUE in the
  // database. Generators that collide make the save fail permanently in the cloud.
  const twinA = db2.addCustomer({ fullName: "Ravi Kumar", mobileNumber: "9876543210", preferredFabricBrands: [] } as any);
  const twinB = db2.addCustomer({ fullName: "Ravi Kumar", mobileNumber: "9876543210", preferredFabricBrands: [] } as any);
  check("same name + same mobile produce distinct customer ids", twinA.id !== twinB.id);
  check("same name + same mobile produce distinct qrCodeId", twinA.qrCodeId !== twinB.qrCodeId,
    `${twinA.qrCodeId} vs ${twinB.qrCodeId}`);

  const rapidIds = new Set<string>();
  const rapidQr = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const c = db2.addCustomer({ fullName: "Bulk Client", mobileNumber: "9000011122", preferredFabricBrands: [] } as any);
    rapidIds.add(c.id); rapidQr.add(c.qrCodeId);
  }
  check("60 same-tick customers all have unique ids", rapidIds.size === 60, `got ${rapidIds.size}`);
  check("60 same-tick customers all have unique qrCodeIds", rapidQr.size === 60, `got ${rapidQr.size}`);

  const orderNums = new Set<string>();
  const invoiceNums = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const o = db2.addOrder({ customerId: twinA.id, garmentTypes: ["Shirt"], garmentLineItems: [],
      linkedMeasurementVersionId: "", fabricDetails: "", expectedDeliveryDate: "2026-12-01",
      status: "Pending", notes: "" } as any, 1000, 0);
    orderNums.add(o.orderNumber);
    const inv = db2.getInvoiceByOrderId(o.id);
    if (inv) invoiceNums.add(inv.invoiceNumber);
  }
  check("40 rapid orders all have unique order numbers", orderNums.size === 40, `got ${orderNums.size}`);
  check("40 rapid invoices all have unique invoice numbers", invoiceNums.size === 40, `got ${invoiceNums.size}`);

  console.log("=== O. ORDER INVOICE vs TRIAL INVOICE (regression) ===");
  const oi = db2.addOrder({ customerId: twinB.id, garmentTypes: ["Coat"], garmentLineItems: [],
    linkedMeasurementVersionId: "", fabricDetails: "", expectedDeliveryDate: "2026-12-05",
    status: "Pending", notes: "" } as any, 20000, 5000);
  const orderInvoice = db2.getInvoiceByOrderId(oi.id)!;
  const ap = db2.addAppointment({ customerId: twinB.id, type: "Trial", dateTime: new Date().toISOString(),
    status: "Completed", notes: "", orderId: oi.id, appointmentType: "Trial Fitting",
    appointmentDate: "2026-12-01", appointmentTime: "10:00", trialCharge: 500, paymentStatus: "Paid" } as any);
  const trialInvoice = db2.getInvoices().find((i: any) => i.linkedAppointmentId === ap.id);
  check("trial charge produced its own invoice", Boolean(trialInvoice));
  check("getInvoiceByOrderId returns the ORDER invoice, not the trial one",
    db2.getInvoiceByOrderId(oi.id)?.id === orderInvoice.id,
    `${db2.getInvoiceByOrderId(oi.id)?.id} vs ${orderInvoice.id}`);
  check("order invoice keeps its own total", db2.getInvoiceByOrderId(oi.id)?.grandTotal === 20000,
    String(db2.getInvoiceByOrderId(oi.id)?.grandTotal));
  db2.updateOrderStatus(oi.id, "Stitching", "Tester");
  check("status change did not overwrite the trial invoice",
    db2.getInvoices().find((i: any) => i.id === trialInvoice!.id)?.grandTotal === 500,
    String(db2.getInvoices().find((i: any) => i.id === trialInvoice!.id)?.grandTotal));
  check("status change did not corrupt the order invoice",
    db2.getInvoiceByOrderId(oi.id)?.grandTotal === 20000);
  check("order advance still recorded", db2.getInvoiceByOrderId(oi.id)?.payments.length === 1);

  console.log("\n" + results.join("\n"));
  console.log(`\n================ ${pass} passed, ${fail} failed ================`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(e => { console.error("HARNESS CRASH:", e); process.exitCode = 1; });
