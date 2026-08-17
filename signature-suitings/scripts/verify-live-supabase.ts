/**
 * END-TO-END VERIFICATION AGAINST A LIVE SUPABASE-COMPATIBLE BACKEND.
 * Runs the application's real db.ts over real HTTP against real PostgREST +
 * PostgreSQL carrying the exact production schema (base + migration v2).
 * Nothing here is mocked except the browser's localStorage.
 */
class MemStorage {
  private m = new Map<string,string>();
  getItem(k:string){return this.m.has(k)?this.m.get(k)!:null;}
  setItem(k:string,v:string){this.m.set(k,String(v));}
  removeItem(k:string){this.m.delete(k);}
  clear(){this.m.clear();}
  key(i:number){return Array.from(this.m.keys())[i]??null;}
  get length(){return this.m.size;}
  wipe(){this.m.clear();}
}
const storage = new MemStorage();
(globalThis as any).localStorage = storage;
(globalThis as any).btoa=(s:string)=>Buffer.from(s,'binary').toString('base64');
(globalThis as any).atob=(s:string)=>Buffer.from(s,'base64').toString('binary');

let pass=0, fail=0; const out:string[]=[];
const check=(n:string,c:boolean,d="")=>{
  const line = c ? `  PASS  ${n}` : `  FAIL  ${n}${d?"  -- "+d:""}`;
  if(c) pass++; else fail++;
  out.push(line); console.log(line);
};
const sec=(t:string)=>{ const line=`\n--- ${t} ---`; out.push(line); console.log(line); };

async function main(){
  const { supabase } = await import('../src/supabase.ts');
  const mod = await import('../src/db.ts');
  const db = mod.db;

  // Direct SQL-layer reader so we assert on what the DATABASE holds, not memory.
  const raw = async (t:string, q="") => {
    const { data, error } = await supabase.from(t).select('*') as any;
    if (error) throw new Error(`${t}: ${error.message}`);
    return data || [];
  };

  await db.waitForSync();
  while ((db as any).isSyncing) await new Promise(r=>setTimeout(r,50));
  await new Promise(r=>setTimeout(r,300));

  sec('0. CONNECTION');
  const { error: connErr } = await supabase.from('customers').select('id').limit(1) as any;
  check('live backend reachable', !connErr, connErr?.message);
  check('starts with zero customers in DB', (await raw('customers')).length===0);

  sec('1. CUSTOMERS — create/read/edit/delete');
  const c1 = db.addCustomer({ fullName:'Ravi Kumar', mobileNumber:'9876500001', address:'12 Mall Rd', email:'ravi@x.com', preferredFabricBrands:[] } as any);
  await db.waitForSync();
  let dbCust = await raw('customers');
  check('CREATE reached Supabase', dbCust.some((r:any)=>r.id===c1.id), JSON.stringify(dbCust.map((r:any)=>r.id)));
  check('CREATE stored correct name', dbCust.find((r:any)=>r.id===c1.id)?.fullName==='Ravi Kumar');
  check('CREATE stored mobile', dbCust.find((r:any)=>r.id===c1.id)?.mobileNumber==='9876500001');

  db.updateCustomer(c1.id,{ fullName:'Ravi Kumar Sharma', address:'99 Model Town' });
  await db.waitForSync();
  dbCust = await raw('customers');
  const edited = dbCust.find((r:any)=>r.id===c1.id);
  check('EDIT kept the same id', Boolean(edited) && edited.id===c1.id);
  check('EDIT persisted to Supabase', edited?.fullName==='Ravi Kumar Sharma', edited?.fullName);
  check('EDIT did not duplicate rows', dbCust.filter((r:any)=>r.id===c1.id).length===1);
  check('EDIT stamped updated_at', Boolean(edited?.updated_at));

  const c2 = db.addCustomer({ fullName:'Temp Walkin', mobileNumber:'9111000111', preferredFabricBrands:[] } as any);
  await db.waitForSync();
  const delRes = await db.deleteCustomer(c2.id);
  await db.waitForSync();
  check('DELETE reported success', delRes.success===true, delRes.error);
  check('DELETE removed row from Supabase', !(await raw('customers')).some((r:any)=>r.id===c2.id));
  check('DELETE tombstoned locally', db.isDeleted('customers', c2.id));
  // Soft delete: the row must be recoverable from the cloud bin, not merely gone.
  check('DELETE snapshotted into the Supabase bin',
    (await raw('trash')).some((r:any)=>r.recordType==='customers' && r.recordId===c2.id));

  sec('2. MEASUREMENTS — save / versioning');
  const m1 = db.saveMeasurement({ customerId:c1.id, tryOnDate:'2026-09-01', deliveryDate:'2026-09-10',
    coatIndoWestern:{ length:'30', chest:'40' } as any, pent:{ waist:'34' } as any, vest:{} as any, shirtKurta:{} as any,
    designNotes:'Slim fit', fabricSelected:'Raymond', liningChoice:'Satin', remarks:'', createdBy:'Test' } as any);
  await db.waitForSync();
  let dbMeas = await raw('measurements');
  check('measurement saved to Supabase', dbMeas.some((r:any)=>r.id===m1.id));
  check('measurement linked to customer', dbMeas.find((r:any)=>r.id===m1.id)?.customerId===c1.id);
  check('slip number generated', Boolean(m1.slipNumber));
  const m2 = db.saveMeasurement({ customerId:c1.id, tryOnDate:'2026-10-01', deliveryDate:'2026-10-10',
    coatIndoWestern:{ length:'31', chest:'41' } as any, pent:{ waist:'35' } as any, vest:{} as any, shirtKurta:{} as any,
    designNotes:'', fabricSelected:'', liningChoice:'', remarks:'', createdBy:'Test' } as any);
  await db.waitForSync();
  dbMeas = await raw('measurements');
  check('second version created (not overwritten)', dbMeas.filter((r:any)=>r.customerId===c1.id).length===2);
  check('versions have distinct ids', m1.id!==m2.id);
  check('latest version is the newer one', db.getLatestMeasurement(c1.id)?.id===m2.id);
  check('measurement change log recorded', (m2.changesSincePrevious||[]).length>0, JSON.stringify(m2.changesSincePrevious));
  const otherCust = db.addCustomer({ fullName:'Other Client', mobileNumber:'9222000222', preferredFabricBrands:[] } as any);
  await db.waitForSync();
  check('measurements are NOT shared between customers', db.getMeasurements(otherCust.id).length===0);

  sec('3. ORDERS — full lifecycle');
  const o1 = db.addOrder({ customerId:c1.id, garmentTypes:['Coat','Pent'], garmentLineItems:[],
    linkedMeasurementVersionId:m2.id, fabricDetails:'Raymond Wool', expectedDeliveryDate:'2026-09-20',
    status:'Pending', notes:'Rush' } as any, 30000, 10000);
  await db.waitForSync();
  let dbOrd = await raw('orders');
  check('ORDER created in Supabase', dbOrd.some((r:any)=>r.id===o1.id));
  check('order links to customer', dbOrd.find((r:any)=>r.id===o1.id)?.customerId===c1.id);
  check('order links to measurement', dbOrd.find((r:any)=>r.id===o1.id)?.linkedMeasurementVersionId===m2.id);
  check('order totalAmount column persisted', Number(dbOrd.find((r:any)=>r.id===o1.id)?.totalAmount)===30000,
    String(dbOrd.find((r:any)=>r.id===o1.id)?.totalAmount));
  check('garmentLineItems column persisted', Array.isArray(dbOrd.find((r:any)=>r.id===o1.id)?.garmentLineItems));

  db.updateOrderStatus(o1.id,'In Cutting','Tester');
  db.updateOrderStatus(o1.id,'Stitching','Tester');
  db.updateOrderStatus(o1.id,'Ready','Tester');
  await db.waitForSync();
  dbOrd = await raw('orders');
  const ordRow = dbOrd.find((r:any)=>r.id===o1.id);
  check('status advanced in Supabase', ordRow?.status==='Ready', ordRow?.status);
  check('status history persisted', Array.isArray(ordRow?.statusHistory) && ordRow.statusHistory.length>=4,
    String(ordRow?.statusHistory?.length));
  check('no duplicate order rows after 3 updates', dbOrd.filter((r:any)=>r.id===o1.id).length===1);

  sec('4. BILLING — invoice generated and linked');
  let dbInv = await raw('invoices');
  const inv = dbInv.find((r:any)=>r.linkedOrderId===o1.id);
  check('invoice auto-created in Supabase', Boolean(inv));
  check('exactly ONE invoice for the order', dbInv.filter((r:any)=>r.linkedOrderId===o1.id).length===1,
    String(dbInv.filter((r:any)=>r.linkedOrderId===o1.id).length));
  check('invoice grandTotal correct', Number(inv?.grandTotal)===30000, String(inv?.grandTotal));
  check('invoice advance correct', Number(inv?.advancePaid)===10000, String(inv?.advancePaid));
  check('invoice balance correct', Number(inv?.balanceDue)===20000, String(inv?.balanceDue));
  check('advance recorded in payments jsonb', Array.isArray(inv?.payments) && inv.payments.length===1);
  check('billing survived 3 status changes', Number(inv?.advancePaid)===10000 && Array.isArray(inv?.payments) && inv.payments.length===1);

  sec('5. PAYMENTS — partial, guards');
  db.recordPayment(inv.id, 12000, 'UPI', 'Counter');
  await db.waitForSync();
  let invRow = (await raw('invoices')).find((r:any)=>r.id===inv.id);
  check('payment persisted to Supabase', Number(invRow?.advancePaid)===22000, String(invRow?.advancePaid));
  check('balance recalculated in DB', Number(invRow?.balanceDue)===8000, String(invRow?.balanceDue));
  check('payment history has 2 entries', invRow?.payments?.length===2, String(invRow?.payments?.length));
  check('status is Partially Paid', invRow?.paymentStatus==='Partially Paid', invRow?.paymentStatus);
  let blocked=false; try { db.recordPayment(inv.id, 999999,'Cash','X'); } catch { blocked=true; }
  check('overpayment rejected', blocked);
  await db.waitForSync();
  invRow = (await raw('invoices')).find((r:any)=>r.id===inv.id);
  check('rejected payment did not reach DB', Number(invRow?.advancePaid)===22000);
  db.recordPayment(inv.id, 8000, 'Cash', 'Counter');
  await db.waitForSync();
  invRow = (await raw('invoices')).find((r:any)=>r.id===inv.id);
  check('final payment settles the bill', Number(invRow?.balanceDue)===0 && invRow?.paymentStatus==='Paid',
    `${invRow?.balanceDue}/${invRow?.paymentStatus}`);

  sec('6. CUSTOMER BALANCE ROLLUP');
  await db.waitForSync();
  const custRow = (await raw('customers')).find((r:any)=>r.id===c1.id);
  check('outstanding balance rolled up to 0', Number(custRow?.outstandingBalance)===0, String(custRow?.outstandingBalance));
  check('order count rolled up', Number(custRow?.totalOrdersCount)===1, String(custRow?.totalOrdersCount));

  sec('7. DELETE SAFETY on paid records');
  let custDelBlocked=false; try { await db.deleteCustomer(c1.id); } catch { custDelBlocked=true; }
  check('customer with payments cannot be deleted', custDelBlocked);
  check('customer still in Supabase', (await raw('customers')).some((r:any)=>r.id===c1.id));
  let ordDelBlocked=false; try { await db.deleteOrder(o1.id); } catch { ordDelBlocked=true; }
  check('order with payments cannot be deleted', ordDelBlocked);
  check('order still in Supabase', (await raw('orders')).some((r:any)=>r.id===o1.id));

  sec('8. TRIALS & FITTINGS');
  const appt = db.addAppointment({ customerId:c1.id, type:'Trial', dateTime:new Date().toISOString(),
    status:'Scheduled', notes:'first trial', orderId:o1.id, appointmentType:'Trial Fitting',
    appointmentDate:'2026-09-15', appointmentTime:'11:00', trialCharge:500, paymentStatus:'Unpaid' } as any);
  await db.waitForSync();
  check('appointment created in Supabase', (await raw('appointments')).some((r:any)=>r.id===appt.id));
  db.updateAppointment(appt.id, { status:'Completed', paymentStatus:'Paid' });
  await db.waitForSync();
  const trialInv = (await raw('invoices')).find((r:any)=>r.linkedAppointmentId===appt.id);
  check('completed trial generated a charge invoice', Boolean(trialInv));
  check('trial invoice amount correct', Number(trialInv?.grandTotal)===500, String(trialInv?.grandTotal));
  db.updateAppointment(appt.id, { status:'Scheduled' });
  await db.waitForSync();
  const stillThere = (await raw('invoices')).find((r:any)=>r.id===trialInv?.id);
  check('paid trial invoice NOT silently deleted on status revert', Boolean(stillThere));

  const trial = db.addTrial({ orderId:o1.id, customerId:c1.id, trialDate:'2026-09-15',
    feedback:'Sleeve tight', alterationRequired:true, conductedBy:'Master' } as any);
  await db.waitForSync();
  check('trial record in Supabase', (await raw('trials')).some((r:any)=>r.id===trial.id));
  const alt = db.addAlteration({ orderId:o1.id, customerId:c1.id, alterationDate:'2026-09-16',
    description:'Take in sleeve', beforeNotes:'', afterNotes:'', handledBy:'Master' } as any);
  await db.waitForSync();
  check('alteration record in Supabase', (await raw('alterations')).some((r:any)=>r.id===alt.id));

  sec('9. WORKERS');
  const w1 = db.addWorker({ name:'Harjeet Singh', mobileNumber:'9000000001', address:'Shop', role:'Master Tailor',
    dailyWages:600, monthlySalary:18000, active:true, joiningDate:'2026-01-01' } as any);
  await db.waitForSync();
  check('worker created in Supabase', (await raw('workers')).some((r:any)=>r.id===w1.id));
  db.updateWorker(w1.id, { monthlySalary:20000 });
  await db.waitForSync();
  check('worker edit persisted', Number((await raw('workers')).find((r:any)=>r.id===w1.id)?.monthlySalary)===20000);
  check('worker id unchanged by edit', (await raw('workers')).filter((r:any)=>r.id===w1.id).length===1);

  sec('10. ATTENDANCE — dedupe against the real unique index');
  const a1 = db.saveAttendance({ workerId:w1.id, date:'2026-08-10', status:'Present' } as any);
  await db.waitForSync();
  const a2 = db.saveAttendance({ workerId:w1.id, date:'2026-08-10', status:'Half Day' } as any);
  await db.waitForSync();
  let dbAtt = await raw('attendance');
  check('one attendance row per worker/day in DB', dbAtt.filter((r:any)=>r.workerId===w1.id && r.date==='2026-08-10').length===1,
    String(dbAtt.filter((r:any)=>r.workerId===w1.id && r.date==='2026-08-10').length));
  check('attendance id is canonical', a1.id===`att_${w1.id}_2026-08-10`, a1.id);
  check('status updated in place', dbAtt.find((r:any)=>r.workerId===w1.id&&r.date==='2026-08-10')?.status==='Half Day');
  const bulk = await db.saveBulkAttendance([
    { workerId:w1.id, date:'2026-08-10', status:'Present' },
    { workerId:w1.id, date:'2026-08-11', status:'Present' },
    { workerId:w1.id, date:'2026-08-12', status:'Absent' }] as any);
  check('bulk attendance save reports success', bulk.success===true, bulk.error);
  await db.waitForSync();
  dbAtt = await raw('attendance');
  check('bulk save did not duplicate existing day', dbAtt.filter((r:any)=>r.workerId===w1.id&&r.date==='2026-08-10').length===1);
  check('bulk save wrote all 3 days', dbAtt.filter((r:any)=>r.workerId===w1.id).length===3, String(dbAtt.filter((r:any)=>r.workerId===w1.id).length));

  sec('11. ADVANCES');
  const adv = db.addAdvance({ workerId:w1.id, amount:5000, date:'2026-08-01', notes:'Festival' } as any);
  await db.waitForSync();
  check('advance created in Supabase', (await raw('advances')).some((r:any)=>r.id===adv.id));
  check('advance amount correct', Number((await raw('advances')).find((r:any)=>r.id===adv.id)?.amount)===5000);
  const delStatus = db.getWorkerDeletionStatus(w1.id);
  check('worker with unpaid advance blocked from deletion', delStatus.allowed===false);

  sec('12. PAYROLL / SALARIES');
  const pay = db.addSalaryPayout({ workerId:w1.id, month:'2026-08', calculatedSalary:20000, presents:24,
    halfDays:1, absents:2, paidLeavesUsed:0, advanceDeductions:5000, bonus:1000, netPaid:16000,
    paymentDate:'2026-09-01', notes:'' } as any);
  await db.waitForSync();
  check('salary payout in Supabase', (await raw('salaries')).some((r:any)=>r.id===pay.id));
  check('netPaid persisted', Number((await raw('salaries')).find((r:any)=>r.id===pay.id)?.netPaid)===16000);
  check('advance marked repaid by deduction', (await raw('advances')).find((r:any)=>r.id===adv.id)?.repaid===true);
  check('salary logged as an expense', (await raw('expenses')).some((r:any)=>r.category==='Tailoring Wages'));

  sec('13. EXPENSES');
  const e1 = db.addExpense({ category:'Rent', amount:25000, date:'2026-08-01', notes:'Shop rent', supplier:'Landlord', paymentMethod:'Bank' } as any);
  await db.waitForSync();
  check('expense created in Supabase', (await raw('expenses')).some((r:any)=>r.id===e1.id));
  db.deleteExpense(e1.id);
  await db.waitForSync();
  check('expense delete removed from Supabase', !(await raw('expenses')).some((r:any)=>r.id===e1.id));

  sec('14. REFRESH PERSISTENCE (reload module, keep cache)');
  const refreshSpec = '../src/db.ts?refresh=1';
  const mod2 = await import(refreshSpec);
  const db2 = mod2.db;
  await db2.waitForSync();
  check('customer survives refresh', Boolean(db2.getCustomerById(c1.id)));
  check('order survives refresh', Boolean(db2.getOrderById(o1.id)));
  check('payments survive refresh', db2.getInvoiceByOrderId(o1.id)?.payments.length===3,
    String(db2.getInvoiceByOrderId(o1.id)?.payments.length));
  check('deleted customer stays deleted after refresh', db2.getCustomerById(c2.id)===undefined);

  sec('15. LOCALSTORAGE CLEAR — must rebuild from Supabase');
  storage.wipe();
  const wipedSpec = '../src/db.ts?wiped=1';
  const mod3 = await import(wipedSpec);
  const db3 = mod3.db;
  await db3.waitForSync();
  await new Promise(r=>setTimeout(r,800));
  await db3.initializeSupabaseSync(false);
  await db3.waitForSync();
  check('customers rebuilt from cloud', db3.getCustomers().length>=2, String(db3.getCustomers().length));
  check('the edited customer came back', db3.getCustomerById(c1.id)?.fullName==='Ravi Kumar Sharma',
    db3.getCustomerById(c1.id)?.fullName);
  check('orders rebuilt from cloud', Boolean(db3.getOrderById(o1.id)));
  check('invoices rebuilt from cloud', Boolean(db3.getInvoiceByOrderId(o1.id)));
  check('payments rebuilt from cloud', db3.getInvoiceByOrderId(o1.id)?.payments.length===3,
    String(db3.getInvoiceByOrderId(o1.id)?.payments.length));
  check('measurements rebuilt from cloud', db3.getMeasurements(c1.id).length===2, String(db3.getMeasurements(c1.id).length));
  check('workers rebuilt from cloud', db3.getWorkers().length===1);
  check('attendance rebuilt from cloud', db3.getAttendance().length===3, String(db3.getAttendance().length));
  check('salaries rebuilt from cloud', db3.getSalaryPayouts().length===1);
  check('DELETED customer NOT resurrected from cloud', db3.getCustomerById(c2.id)===undefined);

  sec('16. NO DUPLICATES AFTER REPEATED SYNCS');
  const before = (await raw('customers')).length;
  await db3.initializeSupabaseSync(false);
  await db3.initializeSupabaseSync(false);
  await db3.waitForSync();
  const after = (await raw('customers')).length;
  check('repeat syncs create no duplicate customers', before===after, `${before} -> ${after}`);
  check('one ORDER invoice per order (trial invoice is separate)',
    (await raw('invoices')).filter((r:any)=>r.linkedOrderId===o1.id && !r.linkedAppointmentId).length===1,
    String((await raw('invoices')).filter((r:any)=>r.linkedOrderId===o1.id && !r.linkedAppointmentId).length));
  const attRows = await raw('attendance');
  check('no duplicate attendance after syncs', new Set(attRows.map((r:any)=>`${r.workerId}|${r.date}`)).size===attRows.length);

  sec('17. DASHBOARD METRICS from real data');
  const invoices = db3.getInvoices();
  const receivables = invoices.reduce((s:number,i:any)=>s+(i.balanceDue>0?i.balanceDue:0),0);
  check('pending receivables computed from invoices', receivables===0, String(receivables));
  check('active orders derived', db3.getOrders().filter((o:any)=>o.status!=='Delivered').length===1);
  check('customer count is real', db3.getCustomers().length===(await raw('customers')).length);

  sec('18. BACKUP / RESTORE against live DB');
  const backup = db3.getBackupData();
  check('backup contains customers', backup.customers.length===(await raw('customers')).length);
  check('backup contains orders', backup.orders.length===1);
  check('backup contains invoices with payments', backup.invoices.some((i:any)=>i.payments?.length===3));
  check('backup contains workers/attendance/salaries', backup.workers.length===1 && backup.attendance.length===3 && backup.salaries.length===1);
  check('backup contains catalog', Array.isArray((backup as any).garmentCatalog) && (backup as any).garmentCatalog.length>0);
  const restoreRes = await db3.restoreBackupData(JSON.parse(JSON.stringify(backup)));
  check('restore reports success', restoreRes.success===true, restoreRes.error);
  await db3.waitForSync();
  check('restore preserved customer count', (await raw('customers')).length===backup.customers.length,
    `${(await raw('customers')).length} vs ${backup.customers.length}`);
  // Assert on BOTH invoices explicitly. The order invoice and the trial-charge invoice both
  // carry this linkedOrderId, and the REST API returns rows in arbitrary order, so an
  // unqualified find() picks either one.
  const afterRestore = await raw('invoices');
  const restoredOrderInv = afterRestore.find((r:any)=>r.linkedOrderId===o1.id && !r.linkedAppointmentId);
  const restoredTrialInv = afterRestore.find((r:any)=>r.linkedAppointmentId);
  check('restore preserved the order invoice payments', restoredOrderInv?.payments?.length===3,
    `order invoice payments=${restoredOrderInv?.payments?.length}`);
  check('restore preserved the trial invoice separately', Number(restoredTrialInv?.grandTotal)===500,
    `trial total=${restoredTrialInv?.grandTotal}`);
  check('restore kept order and trial invoices distinct', restoredOrderInv?.id !== restoredTrialInv?.id);
  check('restore did not duplicate orders', (await raw('orders')).length===1);

  console.log(`\n================ LIVE SUPABASE: ${pass} passed, ${fail} failed ================`);
  try { db.unsubscribeRealtime(); db2.unsubscribeRealtime(); db3.unsubscribeRealtime(); } catch {}
  process.exit(fail>0 ? 1 : 0);
}
// Hard ceiling so a hung network call cannot stall the run silently.
const guard = setTimeout(()=>{ console.error('\nHARNESS TIMEOUT after 240s'); console.log(out.join('\n')); process.exit(2); }, 240000);
guard.unref?.();
main().catch(e=>{ console.error('HARNESS CRASH:', e); console.log(out.join('\n')); process.exit(1); });
