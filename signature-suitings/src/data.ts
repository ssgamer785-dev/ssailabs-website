/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Customer,
  Measurement,
  Order,
  Invoice,
  Appointment,
  Expense,
  User,
  ShopConfig,
  Trial,
  Alteration
} from "./types";

export const initialShopConfig: ShopConfig = {
  shopName: "Signature Suitings",
  tagline: "The Sign of Comfort",
  address: "2, Tara Singh Avenue, Peer Dad Road, Jalandhar, Punjab, India",
  phone1: "93572 51900",
  phone2: "95696 81900",
  gstEnabled: true,
  gstNumber: "03AABCN1234D1Z5",
  gstPercent: 5,
  currencySymbol: "₹",
  garmentTypesConfig: ["Coat/Indo Western", "Pent", "Vest", "Shirt/Kurta"],
  measurementFieldsConfig: {
    "Coat/Indo Western": ["Length", "Chest", "Waist", "Neck", "Tira", "H.B.", "C/Back", "Arms"],
    "Pent": ["Waist", "Hips", "Patt", "Bottom"],
    "Vest": ["Length", "Chest", "Waist", "Hip", "Tira", "Neck"],
    "Shirt/Kurta": ["Length", "Chest", "Waist", "Hip", "Tira", "Arms", "Neck", "C/Back", "Front", "Moda", "Bicep", "Inlength"]
  }
};

export const initialUsers: User[] = [
  {
    id: "usr_admin",
    name: "Hardik Nagpal",
    role: "Admin",
    email: "escortstakes@gmail.com",
    phone: "93572 51900",
    active: true
  },
  {
    id: "usr_staff1",
    name: "Harjeet Singh (Master Tailor)",
    role: "Staff",
    email: "harjeet@signaturesuitings.com",
    phone: "98721 98721",
    active: true
  },
  {
    id: "usr_staff2",
    name: "Raj Kumar (Salesperson)",
    role: "Staff",
    email: "raj@signaturesuitings.com",
    phone: "95696 81900",
    active: true
  }
];

export const initialCustomers: Customer[] = [
  {
    id: "cust_test_rahul",
    fullName: "Rahul Sharma",
    mobileNumber: "9876543210",
    email: "rahul.sharma@example.com",
    customerSince: "2024-03-15T10:00:00.000Z",
    totalOrdersCount: 2,
    outstandingBalance: 6500,
    qrCodeId: "qr_rahul_sharma_43210",
    preferredFabricBrands: ["Raymond", "Italian Wool"],
    preferenceTags: ["Slim Fit", "Two-Button", "Double Vent"],
    memoryNotes: []
  },
  {
    id: "cust_test_amit",
    fullName: "Amit Sharma",
    mobileNumber: "9876543210",
    email: "amit.sharma@example.com",
    customerSince: "2025-01-20T11:30:00.000Z",
    totalOrdersCount: 2,
    outstandingBalance: 2000,
    qrCodeId: "qr_amit_sharma_43210",
    preferredFabricBrands: ["Egyptian Giza Cotton"],
    preferenceTags: ["Formal Shirts", "Cutaway Collar"],
    memoryNotes: []
  },
  {
    id: "cust_test_neha",
    fullName: "Neha Sharma",
    mobileNumber: "9876543210",
    email: "neha.sharma@example.com",
    customerSince: "2023-11-05T09:15:00.000Z",
    totalOrdersCount: 2,
    outstandingBalance: 8000,
    qrCodeId: "qr_neha_sharma_43210",
    preferredFabricBrands: ["Silk Brocade", "Velvet"],
    preferenceTags: ["Bandhgala", "Mandarin Collar"],
    memoryNotes: []
  },
  {
    id: "cust_test_rohan",
    fullName: "Rohan Sharma",
    mobileNumber: "9876543210",
    email: "rohan.sharma@example.com",
    customerSince: "2024-08-18T14:00:00.000Z",
    totalOrdersCount: 1,
    outstandingBalance: 7500,
    qrCodeId: "qr_rohan_sharma_43210",
    preferredFabricBrands: ["Linen", "Tropical Wool"],
    preferenceTags: ["Safari Suit", "Pleated Pants"],
    memoryNotes: []
  },
  {
    id: "cust_test_karan",
    fullName: "Karan Sharma",
    mobileNumber: "9876543210",
    email: "karan.sharma@example.com",
    customerSince: "2025-06-12T16:45:00.000Z",
    totalOrdersCount: 1,
    outstandingBalance: 0,
    qrCodeId: "qr_karan_sharma_43210",
    preferredFabricBrands: ["Scabal Super 140s"],
    preferenceTags: ["Double Breasted", "Peak Lapel"],
    memoryNotes: []
  },
  {
    id: "cust_test_vikram",
    fullName: "Vikram Malhotra",
    mobileNumber: "9812455621",
    email: "vikram@example.com",
    customerSince: "2024-05-10T10:00:00.000Z",
    totalOrdersCount: 1,
    outstandingBalance: 0,
    qrCodeId: "qr_vikram_malhotra_55621",
    preferredFabricBrands: ["Italian Super 120s"],
    preferenceTags: ["Regular Fit"],
    memoryNotes: []
  }
];

export const initialMeasurements: Measurement[] = [
  // 1. Rahul Sharma Measurements
  {
    id: "meas_test_rahul_1",
    customerId: "cust_test_rahul",
    versionDate: "2026-08-10T10:30:00.000Z",
    slipNumber: "SLIP-2026-1030",
    tryOnDate: "2026-08-20",
    deliveryDate: "2026-08-28",
    coatIndoWestern: {
      length: "29",
      chest: "42",
      waist: "38",
      neck: "16",
      tira: "18",
      hb: "19",
      cback: "17.5",
      arms: "25",
      bicep: "15",
      front: "16",
      moda: "19"
    },
    pent: {
      waist: "34",
      hips: "40",
      length: "40",
      inlength: "30",
      patt: "25",
      knee: "19",
      bottom: "15.5"
    },
    vest: {
      length: "23",
      chest: "42",
      waist: "38",
      hip: "40",
      tira: "14",
      neck: "16"
    },
    shirtKurta: {
      length: "30",
      chest: "42",
      waist: "38",
      hip: "41",
      tira: "18",
      arms: "25",
      neck: "16",
      cback: "17.5",
      front: "16",
      moda: "19",
      bicep: "15"
    },
    designNotes: "Notch lapel with midnight blue contrast hand-pick stitching. Two-button front.",
    fabricSelected: "Italian Super 150s Charcoal Wool",
    liningChoice: "Burgundy Silk Satin",
    remarks: "Master tailored slim silhouette fit",
    createdBy: "usr_admin",
    changesSincePrevious: []
  },

  // 2. Amit Sharma Measurements
  {
    id: "meas_test_amit_1",
    customerId: "cust_test_amit",
    versionDate: "2026-08-12T11:00:00.000Z",
    slipNumber: "SLIP-2026-1045",
    tryOnDate: "2026-08-18",
    deliveryDate: "2026-08-22",
    coatIndoWestern: {
      length: "28",
      chest: "38",
      waist: "32",
      neck: "15",
      tira: "17",
      hb: "17.5",
      cback: "16",
      arms: "24",
      bicep: "13.5",
      front: "14.5",
      moda: "17.5"
    },
    pent: {
      waist: "30",
      hips: "36",
      length: "38.5",
      inlength: "28.5",
      patt: "22",
      knee: "17",
      bottom: "14.5"
    },
    vest: {
      length: "22",
      chest: "38",
      waist: "32",
      hip: "36",
      tira: "13.5",
      neck: "15"
    },
    shirtKurta: {
      length: "29",
      chest: "38",
      waist: "32",
      hip: "37",
      tira: "17",
      arms: "24",
      neck: "15",
      cback: "16",
      front: "14.5",
      moda: "17.5",
      bicep: "13.5"
    },
    designNotes: "Semi-spread French cuff bespoke dress shirts with mother of pearl buttons.",
    fabricSelected: "Egyptian Giza Luxury Cotton (White & Sky Blue)",
    remarks: "Slim formal tapered fit",
    createdBy: "usr_staff1",
    changesSincePrevious: []
  },

  // 3. Neha Sharma Measurements
  {
    id: "meas_test_neha_1",
    customerId: "cust_test_neha",
    versionDate: "2026-08-14T14:30:00.000Z",
    slipNumber: "SLIP-2026-1052",
    tryOnDate: "2026-08-25",
    deliveryDate: "2026-09-02",
    coatIndoWestern: {
      length: "27",
      chest: "36",
      waist: "30",
      neck: "14.5",
      tira: "15.5",
      hb: "16",
      cback: "15",
      arms: "23",
      bicep: "13",
      front: "14",
      moda: "17"
    },
    pent: {
      waist: "28",
      hips: "38",
      length: "39",
      inlength: "29",
      patt: "23",
      knee: "18",
      bottom: "16"
    },
    vest: {
      length: "21",
      chest: "36",
      waist: "30",
      hip: "38",
      tira: "13",
      neck: "14.5"
    },
    shirtKurta: {
      length: "28",
      chest: "36",
      waist: "30",
      hip: "38",
      tira: "15.5",
      arms: "23",
      neck: "14.5",
      cback: "15",
      front: "14",
      moda: "17",
      bicep: "13"
    },
    designNotes: "Royal velvet bandhgala jacket with handcrafted antique brass buttons.",
    fabricSelected: "Deep Emerald Velvet & Raw Silk",
    liningChoice: "Paisley Jacquard",
    remarks: "Structured shoulder pads, tailored waist contour",
    createdBy: "usr_admin",
    changesSincePrevious: []
  },

  // 4. Rohan Sharma Measurements
  {
    id: "meas_test_rohan_1",
    customerId: "cust_test_rohan",
    versionDate: "2026-08-15T15:00:00.000Z",
    slipNumber: "SLIP-2026-1060",
    tryOnDate: "2026-08-24",
    deliveryDate: "2026-08-30",
    coatIndoWestern: {
      length: "30.5",
      chest: "44",
      waist: "42",
      neck: "17",
      tira: "19",
      hb: "20",
      cback: "18.5",
      arms: "26",
      bicep: "16",
      front: "17",
      moda: "20"
    },
    pent: {
      waist: "38",
      hips: "44",
      length: "41.5",
      inlength: "31",
      patt: "27",
      knee: "20",
      bottom: "16.5"
    },
    vest: {
      length: "24",
      chest: "44",
      waist: "42",
      hip: "44",
      tira: "15",
      neck: "17"
    },
    shirtKurta: {
      length: "31",
      chest: "44",
      waist: "42",
      hip: "45",
      tira: "19",
      arms: "26",
      neck: "17",
      cback: "18.5",
      front: "17",
      moda: "20",
      bicep: "16"
    },
    designNotes: "Classic 3-piece tailored safari suit with belt loops and expandable pleats.",
    fabricSelected: "Raymond Royal Blue Tropical Blend",
    remarks: "Comfort relaxed fit",
    createdBy: "usr_staff2",
    changesSincePrevious: []
  },

  // 5. Karan Sharma Measurements
  {
    id: "meas_test_karan_1",
    customerId: "cust_test_karan",
    versionDate: "2026-03-20T16:00:00.000Z",
    slipNumber: "SLIP-2026-0955",
    tryOnDate: "2026-03-28",
    deliveryDate: "2026-04-05",
    coatIndoWestern: {
      length: "29.5",
      chest: "40",
      waist: "34",
      neck: "15.5",
      tira: "17.5",
      hb: "18",
      cback: "16.5",
      arms: "24.5",
      bicep: "14",
      front: "15",
      moda: "18"
    },
    pent: {
      waist: "32",
      hips: "39",
      length: "40.5",
      inlength: "30",
      patt: "24",
      knee: "18.5",
      bottom: "15"
    },
    vest: {
      length: "23",
      chest: "40",
      waist: "34",
      hip: "39",
      tira: "14",
      neck: "15.5"
    },
    shirtKurta: {
      length: "29.5",
      chest: "40",
      waist: "34",
      hip: "40",
      tira: "17.5",
      arms: "24.5",
      neck: "15.5",
      cback: "16.5",
      front: "15",
      moda: "18",
      bicep: "14"
    },
    designNotes: "6x2 Double-breasted peak lapel navy chalk stripe suit.",
    fabricSelected: "Scabal Super 140s Navy Stripe Wool",
    liningChoice: "Navy Bemberg Cupro",
    remarks: "Neapolitan shoulder drape, high armhole",
    createdBy: "usr_admin",
    changesSincePrevious: []
  }
];

export const initialOrders: Order[] = [
  // Rahul Sharma: 1 Active + 1 Past
  {
    id: "ord_test_rahul_active",
    customerId: "cust_test_rahul",
    orderNumber: "SS-1030",
    orderDate: "2026-08-10T10:00:00.000Z",
    garmentTypes: ["Coat/Indo Western", "Pent"],
    linkedMeasurementVersionId: "meas_test_rahul_1",
    fabricDetails: "Italian Super 150s Charcoal Wool",
    expectedDeliveryDate: "2026-08-28",
    status: "Stitching",
    statusHistory: [
      { status: "Pending", timestamp: "2026-08-10T10:00:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "In Cutting", timestamp: "2026-08-11T11:30:00.000Z", updatedBy: "Harjeet Singh" },
      { status: "Stitching", timestamp: "2026-08-13T14:00:00.000Z", updatedBy: "Harjeet Singh" }
    ],
    totalAmount: 14500,
    advancePaid: 8000,
    notes: "Bespoke 2-piece tailored lounge suit for wedding reception."
  },
  {
    id: "ord_test_rahul_past",
    customerId: "cust_test_rahul",
    orderNumber: "SS-1024",
    orderDate: "2026-04-12T11:00:00.000Z",
    garmentTypes: ["Coat/Indo Western", "Pent"],
    linkedMeasurementVersionId: "meas_test_rahul_1",
    fabricDetails: "Navy Blue Merino Wool",
    expectedDeliveryDate: "2026-04-25",
    actualDeliveryDate: "2026-04-25",
    status: "Delivered",
    statusHistory: [
      { status: "Pending", timestamp: "2026-04-12T11:00:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "Ready", timestamp: "2026-04-24T15:00:00.000Z", updatedBy: "Harjeet Singh" },
      { status: "Delivered", timestamp: "2026-04-25T17:30:00.000Z", updatedBy: "Raj Kumar" }
    ],
    totalAmount: 12000,
    advancePaid: 12000,
    notes: "Completed and delivered to customer satisfaction."
  },

  // Amit Sharma: 1 Active + 1 Past
  {
    id: "ord_test_amit_active",
    customerId: "cust_test_amit",
    orderNumber: "SS-1045",
    orderDate: "2026-08-12T11:30:00.000Z",
    garmentTypes: ["Shirt/Kurta", "Shirt/Kurta"],
    linkedMeasurementVersionId: "meas_test_amit_1",
    fabricDetails: "Egyptian Giza Cotton (White & Sky Blue)",
    expectedDeliveryDate: "2026-08-22",
    status: "Trial Scheduled",
    statusHistory: [
      { status: "Pending", timestamp: "2026-08-12T11:30:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "In Cutting", timestamp: "2026-08-13T10:00:00.000Z", updatedBy: "Harjeet Singh" },
      { status: "Trial Scheduled", timestamp: "2026-08-14T16:00:00.000Z", updatedBy: "Raj Kumar" }
    ],
    totalAmount: 5000,
    advancePaid: 3000,
    notes: "2 custom monogrammed French cuff formal shirts."
  },
  {
    id: "ord_test_amit_past",
    customerId: "cust_test_amit",
    orderNumber: "SS-0987",
    orderDate: "2026-05-10T14:00:00.000Z",
    garmentTypes: ["Shirt/Kurta"],
    linkedMeasurementVersionId: "meas_test_amit_1",
    fabricDetails: "Pure Linen White",
    expectedDeliveryDate: "2026-05-18",
    actualDeliveryDate: "2026-05-18",
    status: "Delivered",
    statusHistory: [
      { status: "Pending", timestamp: "2026-05-10T14:00:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "Delivered", timestamp: "2026-05-18T16:00:00.000Z", updatedBy: "Raj Kumar" }
    ],
    totalAmount: 2500,
    advancePaid: 2500,
    notes: "Delivered on schedule."
  },

  // Neha Sharma: 1 Active + 1 Past
  {
    id: "ord_test_neha_active",
    customerId: "cust_test_neha",
    orderNumber: "SS-1052",
    orderDate: "2026-08-14T14:00:00.000Z",
    garmentTypes: ["Coat/Indo Western", "Pent"],
    linkedMeasurementVersionId: "meas_test_neha_1",
    fabricDetails: "Emerald Velvet Bandhgala Suit",
    expectedDeliveryDate: "2026-09-02",
    status: "Pending",
    statusHistory: [
      { status: "Pending", timestamp: "2026-08-14T14:00:00.000Z", updatedBy: "Hardik Nagpal" }
    ],
    totalAmount: 18000,
    advancePaid: 10000,
    notes: "Royal Emerald Velvet Bandhgala with matching tailored trousers."
  },
  {
    id: "ord_test_neha_past",
    customerId: "cust_test_neha",
    orderNumber: "SS-0842",
    orderDate: "2025-12-04T12:00:00.000Z",
    garmentTypes: ["Coat/Indo Western"],
    linkedMeasurementVersionId: "meas_test_neha_1",
    fabricDetails: "Brocade Silk Blazer",
    expectedDeliveryDate: "2025-12-18",
    actualDeliveryDate: "2025-12-18",
    status: "Delivered",
    statusHistory: [
      { status: "Pending", timestamp: "2025-12-04T12:00:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "Delivered", timestamp: "2025-12-18T18:00:00.000Z", updatedBy: "Raj Kumar" }
    ],
    totalAmount: 9500,
    advancePaid: 9500,
    notes: "Delivered in showroom."
  },

  // Rohan Sharma: 1 Active
  {
    id: "ord_test_rohan_active",
    customerId: "cust_test_rohan",
    orderNumber: "SS-1060",
    orderDate: "2026-08-15T15:00:00.000Z",
    garmentTypes: ["Coat/Indo Western", "Pent", "Vest"],
    linkedMeasurementVersionId: "meas_test_rohan_1",
    fabricDetails: "Raymond Royal Blue 3-Piece Safari Fabric",
    expectedDeliveryDate: "2026-08-30",
    status: "In Cutting",
    statusHistory: [
      { status: "Pending", timestamp: "2026-08-15T15:00:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "In Cutting", timestamp: "2026-08-15T16:30:00.000Z", updatedBy: "Harjeet Singh" }
    ],
    totalAmount: 22500,
    advancePaid: 15000,
    notes: "3-Piece Safari Suit with custom buttons and belt loops."
  },

  // Karan Sharma: 1 Past
  {
    id: "ord_test_karan_past",
    customerId: "cust_test_karan",
    orderNumber: "SS-0955",
    orderDate: "2026-03-22T15:30:00.000Z",
    garmentTypes: ["Coat/Indo Western", "Pent"],
    linkedMeasurementVersionId: "meas_test_karan_1",
    fabricDetails: "Scabal Super 140s Navy Stripe Wool",
    expectedDeliveryDate: "2026-04-05",
    actualDeliveryDate: "2026-04-05",
    status: "Delivered",
    statusHistory: [
      { status: "Pending", timestamp: "2026-03-22T15:30:00.000Z", updatedBy: "Hardik Nagpal" },
      { status: "Delivered", timestamp: "2026-04-05T17:00:00.000Z", updatedBy: "Raj Kumar" }
    ],
    totalAmount: 16000,
    advancePaid: 16000,
    notes: "Delivered and settled in full."
  }
];

export const initialTrialsAndAlterations = {
  trials: [] as Trial[],
  alterations: [] as Alteration[]
};

export const initialInvoices: Invoice[] = [
  {
    id: "inv_test_rahul_active",
    customerId: "cust_test_rahul",
    invoiceNumber: "INV-2026-1030",
    invoiceDate: "2026-08-10T10:00:00.000Z",
    linkedOrderId: "ord_test_rahul_active",
    lineItems: [
      { description: "Bespoke 2-Piece Suit (Italian Super 150s)", quantity: 1, rate: 14500, amount: 14500 }
    ],
    subtotal: 14500,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 14500,
    advancePaid: 8000,
    balanceDue: 6500,
    paymentStatus: "Partially Paid",
    payments: [
      { amount: 8000, date: "2026-08-10T10:00:00.000Z", mode: "UPI", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_rahul_past",
    customerId: "cust_test_rahul",
    invoiceNumber: "INV-2026-1024",
    invoiceDate: "2026-04-12T11:00:00.000Z",
    linkedOrderId: "ord_test_rahul_past",
    lineItems: [
      { description: "Custom 2-Piece Suit (Merino Wool)", quantity: 1, rate: 12000, amount: 12000 }
    ],
    subtotal: 12000,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 12000,
    advancePaid: 12000,
    balanceDue: 0,
    paymentStatus: "Paid",
    payments: [
      { amount: 6000, date: "2026-04-12T11:00:00.000Z", mode: "Cash", recordedBy: "Hardik Nagpal" },
      { amount: 6000, date: "2026-04-25T17:30:00.000Z", mode: "UPI", recordedBy: "Raj Kumar" }
    ]
  },
  {
    id: "inv_test_amit_active",
    customerId: "cust_test_amit",
    invoiceNumber: "INV-2026-1045",
    invoiceDate: "2026-08-12T11:30:00.000Z",
    linkedOrderId: "ord_test_amit_active",
    lineItems: [
      { description: "Bespoke Giza Cotton Shirts", quantity: 2, rate: 2500, amount: 5000 }
    ],
    subtotal: 5000,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 5000,
    advancePaid: 3000,
    balanceDue: 2000,
    paymentStatus: "Partially Paid",
    payments: [
      { amount: 3000, date: "2026-08-12T11:30:00.000Z", mode: "UPI", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_amit_past",
    customerId: "cust_test_amit",
    invoiceNumber: "INV-2026-0987",
    invoiceDate: "2026-05-10T14:00:00.000Z",
    linkedOrderId: "ord_test_amit_past",
    lineItems: [
      { description: "Pure Linen Shirt", quantity: 1, rate: 2500, amount: 2500 }
    ],
    subtotal: 2500,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 2500,
    advancePaid: 2500,
    balanceDue: 0,
    paymentStatus: "Paid",
    payments: [
      { amount: 2500, date: "2026-05-10T14:00:00.000Z", mode: "Cash", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_neha_active",
    customerId: "cust_test_neha",
    invoiceNumber: "INV-2026-1052",
    invoiceDate: "2026-08-14T14:00:00.000Z",
    linkedOrderId: "ord_test_neha_active",
    lineItems: [
      { description: "Royal Velvet Bandhgala Suit", quantity: 1, rate: 18000, amount: 18000 }
    ],
    subtotal: 18000,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 18000,
    advancePaid: 10000,
    balanceDue: 8000,
    paymentStatus: "Partially Paid",
    payments: [
      { amount: 10000, date: "2026-08-14T14:00:00.000Z", mode: "Card", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_neha_past",
    customerId: "cust_test_neha",
    invoiceNumber: "INV-2025-0842",
    invoiceDate: "2025-12-04T12:00:00.000Z",
    linkedOrderId: "ord_test_neha_past",
    lineItems: [
      { description: "Brocade Silk Blazer", quantity: 1, rate: 9500, amount: 9500 }
    ],
    subtotal: 9500,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 9500,
    advancePaid: 9500,
    balanceDue: 0,
    paymentStatus: "Paid",
    payments: [
      { amount: 9500, date: "2025-12-04T12:00:00.000Z", mode: "UPI", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_rohan_active",
    customerId: "cust_test_rohan",
    invoiceNumber: "INV-2026-1060",
    invoiceDate: "2026-08-15T15:00:00.000Z",
    linkedOrderId: "ord_test_rohan_active",
    lineItems: [
      { description: "3-Piece Safari Suit", quantity: 1, rate: 22500, amount: 22500 }
    ],
    subtotal: 22500,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 22500,
    advancePaid: 15000,
    balanceDue: 7500,
    paymentStatus: "Partially Paid",
    payments: [
      { amount: 15000, date: "2026-08-15T15:00:00.000Z", mode: "Bank Transfer", recordedBy: "Hardik Nagpal" }
    ]
  },
  {
    id: "inv_test_karan_past",
    customerId: "cust_test_karan",
    invoiceNumber: "INV-2026-0955",
    invoiceDate: "2026-03-22T15:30:00.000Z",
    linkedOrderId: "ord_test_karan_past",
    lineItems: [
      { description: "Double Breasted Scabal Suit", quantity: 1, rate: 16000, amount: 16000 }
    ],
    subtotal: 16000,
    discount: 0,
    taxPercent: 0,
    taxAmount: 0,
    grandTotal: 16000,
    advancePaid: 16000,
    balanceDue: 0,
    paymentStatus: "Paid",
    payments: [
      { amount: 16000, date: "2026-03-22T15:30:00.000Z", mode: "UPI", recordedBy: "Hardik Nagpal" }
    ]
  }
];

export const initialAppointments: Appointment[] = [];

export const initialExpenses: Expense[] = [];
