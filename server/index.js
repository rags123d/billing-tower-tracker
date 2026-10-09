import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { analyzePdfDocument } from "./pdfAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(uploadsDir));

// Password hashing utility using built-in crypto
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [salt, hash] = storedHash.split(":");
    const testHash = crypto.scryptSync(password, salt, 32).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
  } catch {
    return false;
  }
}

// In-memory demo users store
const users = [
  {
    id: "usr_admin",
    username: "billing_admin",
    email: "billing_admin@billing.gov",
    passwordHash: hashPassword("Admin@Tower2026"),
    name: "Billing Administrator",
    role: "System Administrator",
    department: "Executive & Systems Directorate",
    badgeColor: "#8b5cf6"
  }
];

// In-memory session store: token -> { userId, expiresAt, createdAt }
const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  sessions.set(token, { userId, expiresAt, createdAt: Date.now() });
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

// Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }

  const token = authHeader.slice(7).trim();
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: "Session expired or invalid token. Please log in again." });
  }

  req.user = user;
  req.token = token;
  next();
}


const workflows = {
  BBMP_LAKES: [
    "Tapal", "AE", "AEE", "EE", "Attendance Certification",
    "AEE", "JC", "Additional Revenue Commissioner", "DCF Fund",
    "EE", "DC Bill", "DCF Payments"
  ],
  STANDARD: [
    "Tapal", "AE", "AEE", "EE", "Attendance Certification",
    "AEE", "JC", "Accounts", "Finance Verification",
    "EE", "DC Bill", "DCF Payments"
  ]
};

// Tower Master In-Memory Store
const towers = new Map([
  [
    "TWR-101",
    {
      id: "TWR-101",
      code: "TWR-BLR-01",
      name: "Bellandur North Inflow Tower",
      ward: "Ward 42, Bellandur",
      zone: "Mahadevapura Zone",
      contractor: "Sri Sai Infratech Projects",
      budget: "₹ 75,00,000",
      budgetNum: 7500000,
      location: "Bellandur North Weir, Zone 4",
      status: "ACTIVE",
      description: "Primary inlet aeration tower and telemetry station monitoring water volume and desiltation.",
      createdAt: new Date(Date.now() - 3600000 * 24 * 60).toISOString()
    }
  ],
  [
    "TWR-102",
    {
      id: "TWR-102",
      code: "TWR-HBL-02",
      name: "Hebbal Lake Aeration Tower",
      ward: "Ward 18, Hebbal",
      zone: "Yelahanka Zone",
      contractor: "Karnataka Water Infrastructure Ltd",
      budget: "₹ 62,50,000",
      budgetNum: 6250000,
      location: "Hebbal Lake Basin, North Gate",
      status: "ACTIVE",
      description: "Secondary aeration tower and bund stabilization monitoring mast.",
      createdAt: new Date(Date.now() - 3600000 * 24 * 45).toISOString()
    }
  ],
  [
    "TWR-103",
    {
      id: "TWR-103",
      code: "TWR-KRM-03",
      name: "Koramangala Valley Drainage Tower",
      ward: "Ward 68, Koramangala",
      zone: "South Zone",
      contractor: "Apex Urban Engineering Corp",
      budget: "₹ 90,00,000",
      budgetNum: 9000000,
      location: "K&C Valley Culvert 3, Near ST Road",
      status: "ACTIVE",
      description: "Stormwater and weir outlet monitoring tower with automated discharge telemetry.",
      createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString()
    }
  ],
  [
    "TWR-104",
    {
      id: "TWR-104",
      code: "TWR-YLH-04",
      name: "Yelahanka Wetland Monitoring Tower",
      ward: "Ward 05, Yelahanka",
      zone: "Yelahanka Zone",
      contractor: "GreenTech Eco Solutions",
      budget: "₹ 45,00,000",
      budgetNum: 4500000,
      location: "Yelahanka Kere Eastern Bund",
      status: "ACTIVE",
      description: "Eco-wetland bird sanctuary and water purification monitoring tower.",
      createdAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString()
    }
  ],
  [
    "TWR-105",
    {
      id: "TWR-105",
      code: "TWR-WTF-05",
      name: "Whitefield Sub-Basin Sluice Tower",
      ward: "Ward 84, Mahadevapura",
      zone: "East Zone",
      contractor: "Vanguard Infra Ventures",
      budget: "₹ 55,00,000",
      budgetNum: 5500000,
      location: "Varthur-Whitefield Canal Point 2",
      status: "MAINTENANCE",
      description: "Sluice gate control tower and silt deposition measurement center.",
      createdAt: new Date(Date.now() - 3600000 * 24 * 15).toISOString()
    }
  ]
]);

// Helper to parse currency string into number
function parseCurrency(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  const cleaned = str.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

// Helper to compute tax and invoice breakdown
function computeInvoiceBreakdown(grossAmount) {
  const gross = typeof grossAmount === "number" ? grossAmount : parseCurrency(grossAmount);
  const gstTds = Math.round(gross * 0.02); // 2% GST TDS
  const itTds = Math.round(gross * 0.02);  // 2% Income Tax TDS
  const laborCess = Math.round(gross * 0.01); // 1% Labor Welfare Cess
  const retention = Math.round(gross * 0.05); // 5% Contractor Security Deposit / Retention
  const totalDeductions = gstTds + itTds + laborCess + retention;
  const netPayable = gross - totalDeductions;
  return {
    gross,
    gstTds,
    itTds,
    laborCess,
    retention,
    totalDeductions,
    netPayable
  };
}

// Curated, site-specific high-resolution inspection photos for each BBMP site/tower
const SITE_INSPECTION_PHOTOS = {
  "TWR-101": [
    {
      id: "photo-blr-01",
      url: "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=1200&q=80",
      title: "Inlet Channel Desilting & Excavation",
      caption: "Heavy amphibious excavator removing deep accumulated silt and aquatic weed bed along northern inlet channel chainage 0+150.",
      siteLocation: "Bellandur Lake North Weir (Ward 42)",
      stage: "Step 5 — Executive Engineer Scrutiny",
      geoTag: "12.9352° N, 77.6744° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 28).toISOString()
    },
    {
      id: "photo-blr-02",
      url: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=80",
      title: "Northern Masonry Silt Weir Restoration",
      caption: "Reconstruction of stone masonry overflow crest, weir baffle wall, and hydraulic discharge apron.",
      siteLocation: "Bellandur North Weir, Zone 4",
      stage: "Step 4 — EE Verification",
      geoTag: "12.9368° N, 77.6755° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 36).toISOString()
    },
    {
      id: "photo-blr-03",
      url: "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=1200&q=80",
      title: "Western Bund Stone Pitching & Compaction",
      caption: "Granite boulder pitching along the western lake bund embankment slope to protect against scour and erosion.",
      siteLocation: "Bellandur Lake Western Bund",
      stage: "Step 3 — AEE Field Inspection",
      geoTag: "12.9341° N, 77.6710° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 42).toISOString()
    },
    {
      id: "photo-blr-04",
      url: "https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=1200&q=80",
      title: "Trash Rack Screen & Intake Culvert Clearing",
      caption: "Inspection of heavy steel bar debris screen and concrete wing walls at stormwater intake culvert.",
      siteLocation: "Bellandur Lake Primary Inflow Point",
      stage: "Step 2 — Assistant Engineer Scrutiny",
      geoTag: "12.9380° N, 77.6772° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 46).toISOString()
    }
  ],
  "TWR-102": [
    {
      id: "photo-hbl-01",
      url: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1200&q=80",
      title: "Lake Surface Aeration Jet Spray Fountains",
      caption: "High-volume aeration spray fountains operating in north basin to super-oxygenate water and prevent algal bloom.",
      siteLocation: "Hebbal Lake Basin, North Gate (Ward 18)",
      stage: "Step 3 — Field Scrutiny",
      geoTag: "13.0458° N, 77.5912° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 18).toISOString()
    },
    {
      id: "photo-hbl-02",
      url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
      title: "Compressor Sub-Station & Step-down Transformer",
      caption: "45 kW twin-screw rotary air compressor installation and LT electrical switchgear panel for aeration lines.",
      siteLocation: "Hebbal Lake North Substation Yard",
      stage: "Step 2 — Technical Scrutiny",
      geoTag: "13.0465° N, 77.5925° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      id: "photo-hbl-03",
      url: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80",
      title: "Submerged HDPE Aeration Diffuser Grid",
      caption: "Anchoring of 160mm submerged high-density polyethylene micro-bubble diffuser pipes across 300m lake bed span.",
      siteLocation: "Hebbal Lake Deep Water Zone",
      stage: "Step 2 — Measurement Verification",
      geoTag: "13.0440° N, 77.5900° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 30).toISOString()
    },
    {
      id: "photo-hbl-04",
      url: "https://images.unsplash.com/photo-1508873696983-2df5703bc20d?auto=format&fit=crop&w=1200&q=80",
      title: "Optical DO Telemetry Sensor Mast",
      caption: "Solar-powered real-time water dissolved-oxygen telemetry sensor mast and SCADA transmitter.",
      siteLocation: "Hebbal Lake Eastern Bund Mast TWR-102",
      stage: "Step 1 — Docket Initiation",
      geoTag: "13.0470° N, 77.5930° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 38).toISOString()
    }
  ],
  "TWR-103": [
    {
      id: "photo-krm-01",
      url: "https://images.unsplash.com/photo-1541888946425-d0fbb18615f8?auto=format&fit=crop&w=1200&q=80",
      title: "Stormwater Conduit Deep Channel Desilting",
      caption: "Heavy hydraulic crawler excavator extracting compacted sediment sludge from K&C Valley primary conduit.",
      siteLocation: "K&C Valley Culvert 3 (Ward 68, Koramangala)",
      stage: "Step 8 — Tax Invoice Preparation",
      geoTag: "12.9279° N, 77.6271° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 14).toISOString()
    },
    {
      id: "photo-krm-02",
      url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
      title: "Reinforced Concrete Box Culvert Shoring",
      caption: "Structural reinforcement and formwork inspection of M30 concrete barrel culvert soffit and retaining walls.",
      siteLocation: "Koramangala Culvert 3 Junction",
      stage: "Step 7 — Joint Inspection Pass",
      geoTag: "12.9285° N, 77.6280° E",
      uploadedBy: "Rajesh Kumar (Executive Engineer)",
      uploadedAt: new Date(Date.now() - 3600000 * 20).toISOString()
    },
    {
      id: "photo-krm-03",
      url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=1200&q=80",
      title: "Canal Retaining Wall Foundation Sheet Piling",
      caption: "Sheet piling and deep footing excavation for 4.5m cantilever retaining wall to protect roadway embankment.",
      siteLocation: "K&C Valley Chainage 1+800",
      stage: "Step 5 — Executive Engineer Scrutiny",
      geoTag: "12.9265° N, 77.6255° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 32).toISOString()
    },
    {
      id: "photo-krm-04",
      url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
      title: "Sediment Silt Trap Chamber Cleared",
      caption: "Post-desilting verification of concrete sediment detention chamber before monsoon stormwater discharge.",
      siteLocation: "Koramangala Valley Silt Trap Point C",
      stage: "Step 4 — EE Verification",
      geoTag: "12.9290° N, 77.6292° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 45).toISOString()
    }
  ],
  "TWR-104": [
    {
      id: "photo-ylh-01",
      url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
      title: "Constructed Wetland Bio-Filter Islands",
      caption: "Constructed bio-filtration wetland beds featuring Typha and Phragmites reeds actively purifying urban inflow.",
      siteLocation: "Yelahanka Kere Eastern Bund (Ward 05)",
      stage: "Step 12 — Statutory Audit & Reconciliation",
      geoTag: "13.1007° N, 77.5963° E",
      uploadedBy: "GreenTech Eco Solutions",
      uploadedAt: new Date(Date.now() - 3600000 * 8).toISOString()
    },
    {
      id: "photo-ylh-02",
      url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80",
      title: "Ecology Security Bio-Fencing Boundary",
      caption: "Galvanized heavy chain-link perimeter fence integrated with dense green hedgerow along sanctuary buffer zone.",
      siteLocation: "Yelahanka Wetland Ecological Boundary",
      stage: "Step 11 — Completion Clearance",
      geoTag: "13.1015° N, 77.5980° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 16).toISOString()
    },
    {
      id: "photo-ylh-03",
      url: "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80",
      title: "Solar Telemetry Tower Array Commissioning",
      caption: "Commissioning of standalone solar photovoltaic array and weather telemetry mast TWR-104.",
      siteLocation: "Yelahanka Kere Monitoring Mast Tower",
      stage: "Step 10 — Disbursal Pre-check",
      geoTag: "13.0995° N, 77.5950° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 22).toISOString()
    },
    {
      id: "photo-ylh-04",
      url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80",
      title: "Riparian Native Shoreline Plantation",
      caption: "Riparian tree saplings and indigenous wetland bushes planted to stabilize bund and support bird roosting.",
      siteLocation: "Yelahanka Lake Island Sanctuary",
      stage: "Step 8 — Financial Scrutiny",
      geoTag: "13.1020° N, 77.5990° E",
      uploadedBy: "GreenTech Eco Solutions",
      uploadedAt: new Date(Date.now() - 3600000 * 35).toISOString()
    }
  ],
  "TWR-105": [
    {
      id: "photo-wtf-01",
      url: "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1200&q=80",
      title: "Hydraulic Sluice Gate Spillway Structure",
      caption: "Structural steel vertical sluice gate mounted on reinforced concrete guide piers on Whitefield canal.",
      siteLocation: "Varthur-Whitefield Canal Point 2 (Ward 84)",
      stage: "Step 2 — Technical Scrutiny",
      geoTag: "12.9698° N, 77.7499° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: "photo-wtf-02",
      url: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80",
      title: "Motorized Actuator Gearbox & Piston Ram",
      caption: "Testing 3-phase automated electric actuator and heavy-duty stainless steel lifting spindle mechanism.",
      siteLocation: "Whitefield Sluice Actuator House",
      stage: "Step 2 — Measurement Verification",
      geoTag: "12.9705° N, 77.7510° E",
      uploadedBy: "Vanguard Infra Ventures",
      uploadedAt: new Date(Date.now() - 3600000 * 10).toISOString()
    },
    {
      id: "photo-wtf-03",
      url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      title: "Canal Headworks Spillway & Bypass Regulator",
      caption: "Hydraulic calibration over masonry crest weir upstream of automated regulating sluice gates.",
      siteLocation: "Whitefield Canal Regulator Intake",
      stage: "Step 1 — Docket Initiation",
      geoTag: "12.9685° N, 77.7485° E",
      uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
      uploadedAt: new Date(Date.now() - 3600000 * 18).toISOString()
    },
    {
      id: "photo-wtf-04",
      url: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80",
      title: "Ultrasonic Water Level Telemetry Console",
      caption: "PLC telemetry cabinet with ultrasonic level sensor transmitting water level data directly to control center.",
      siteLocation: "Tower TWR-105 Telemetry Enclosure",
      stage: "Step 1 — Docket Initiation",
      geoTag: "12.9710° N, 77.7520° E",
      uploadedBy: "Vanguard Infra Ventures",
      uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString()
    }
  ],
  "TWR-106": [
    {
      id: "photo-weir-01",
      url: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1200&q=80",
      title: "Completed Stepped Masonry Silt Weir",
      caption: "Completed RR masonry silt detention weir functioning with laminar overflow crest discharge.",
      siteLocation: "Bellandur North Weir, Zone 4 (Ward 42)",
      stage: "Step 12 — File Permanently Closed & Sealed",
      geoTag: "12.9360° N, 77.6750° E",
      uploadedBy: "Rajesh Kumar (System Administrator)",
      uploadedAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString()
    },
    {
      id: "photo-weir-02",
      url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
      title: "Heavy Granite Boulder Pitching & Gabions",
      caption: "Completed wire-mesh gabion stone revetment stabilizing downstream embankment against scour.",
      siteLocation: "Bellandur Silt Weir Embankment",
      stage: "Step 12 — Final Statutory Clearance",
      geoTag: "12.9350° N, 77.6740° E",
      uploadedBy: "Sri Sai Infratech Projects",
      uploadedAt: new Date(Date.now() - 3600000 * 24 * 22).toISOString()
    },
    {
      id: "photo-weir-03",
      url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80",
      title: "Finished Concrete Spillway Apron",
      caption: "Inspection of reinforced concrete apron slab and chute blocks dissipating kinetic energy.",
      siteLocation: "Bellandur Weir Discharge Apron",
      stage: "Step 12 — Final Audit Pass",
      geoTag: "12.9365° N, 77.6758° E",
      uploadedBy: "Rajesh Kumar (System Administrator)",
      uploadedAt: new Date(Date.now() - 3600000 * 24 * 25).toISOString()
    },
    {
      id: "photo-weir-04",
      url: "https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1200&q=80",
      title: "Restored Lake Shoreline & Intake Channel",
      caption: "Final handover inspection showing sediment-free inflow channel and restored lake periphery.",
      siteLocation: "Bellandur Inflow Channel Zone 4",
      stage: "Step 12 — Final Completion Handover",
      geoTag: "12.9372° N, 77.6765° E",
      uploadedBy: "Rajesh Kumar (System Administrator)",
      uploadedAt: new Date(Date.now() - 3600000 * 24 * 28).toISOString()
    }
  ]
};

// Helper to get matching site inspection photos based on tower or project keywords
function getDefaultSitePhotosForTower(towerId, projectName = "", ward = "") {
  if (towerId && SITE_INSPECTION_PHOTOS[towerId]) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS[towerId]));
  }
  const lower = (projectName + " " + ward).toLowerCase();
  if (lower.includes("hebbal") || lower.includes("aerat")) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-102"]));
  }
  if (lower.includes("koramangala") || lower.includes("culvert") || lower.includes("drain")) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-103"]));
  }
  if (lower.includes("yelahanka") || lower.includes("wetland") || lower.includes("fenc")) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-104"]));
  }
  if (lower.includes("whitefield") || lower.includes("sluice") || lower.includes("gate")) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-105"]));
  }
  if (lower.includes("weir") || lower.includes("pitching") || lower.includes("phase 1")) {
    return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-106"]));
  }
  return JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-101"]));
}

// Demo in-memory bills state covering every stage of the user's workflow:
// DRAFT -> SUBMITTED -> UNDER_REVIEW -> (REJECTED_EDIT / INVOICE -> PAYMENT -> PAID -> CLOSED)
const bills = new Map([
  [
    "BILL-1001",
    {
      id: "BILL-1001",
      towerId: "TWR-101",
      projectName: "BBMP Lakes Maintenance - Ward 42",
      projectType: "BBMP_LAKES",
      workflowStatus: "UNDER_REVIEW", // In REVIEW stage
      currentStep: 5,
      amount: "₹ 48,75,000",
      amountNum: 4875000,
      contractor: "Sri Sai Infratech Projects",
      ward: "Ward 42, Bellandur Lake Area",
      mbNumber: "MB-2026/042-A",
      description: "Desilting, bund strengthening, weir restoration and inlet gate civil improvements.",
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-101"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-101"].map((p) => p.url),
      documents: [
        {
          id: "doc-sample-1",
          name: "Ward42_Lake_Desilting_Measurement_Book.pdf",
          type: "pdf",
          size: 142850,
          uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          uploadedBy: "Dr. Priya Sharma (Field Officer (AEE))",
          url: "/uploads/demo-measurement-book.pdf"
        },
        {
          id: "doc-sample-2",
          name: "Detailed_Rate_Estimate_BoQ_FY2026.csv",
          type: "excel",
          size: 89400,
          uploadedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          uploadedBy: "Anil Mehta (Accounts & Finance Lead)",
          url: "/uploads/demo-estimate-boq.csv"
        }
      ],
      history: [
        {
          step: 1,
          startedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          action: "Billing created & docketed under Tower TWR-101",
          performedBy: "Dr. Priya Sharma (Field Officer (AEE))"
        },
        {
          step: 2,
          startedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
          action: "Submitted for Departmental Review",
          performedBy: "Dr. Priya Sharma (Field Officer (AEE))"
        },
        {
          step: 5,
          startedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          action: "Currently In Review Queue for Executive Engineer Scrutiny",
          performedBy: "Rajesh Kumar (System Administrator)"
        }
      ]
    }
  ],
  [
    "BILL-1002",
    {
      id: "BILL-1002",
      towerId: "TWR-102",
      projectName: "Hebbal Lake Aeration Tower Expansion",
      projectType: "STANDARD",
      workflowStatus: "REJECTED_EDIT", // In EDIT stage because Review was Rejected!
      rejectionReason: "Measurement discrepancy in MB Book sheet 14. Bund compaction test report missing from lab certification.",
      rejectedBy: "Anil Mehta (Accounts & Finance Lead)",
      rejectedAt: new Date(Date.now() - 3600000 * 14).toISOString(),
      currentStep: 3,
      amount: "₹ 32,40,000",
      amountNum: 3240000,
      contractor: "Karnataka Water Infrastructure Ltd",
      ward: "Ward 18, Hebbal",
      mbNumber: "MB-2026/018-B",
      description: "Installation of diffuse aeration pipelines, electrical sub-station transformer connection, and telemetry sensors.",
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-102"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-102"].map((p) => p.url),
      documents: [],
      history: [
        {
          step: 1,
          startedAt: new Date(Date.now() - 3600000 * 40).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 20).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 40).toISOString(),
          action: "Billing created and submitted",
          performedBy: "Dr. Priya Sharma (Field Officer (AEE))"
        },
        {
          step: 3,
          startedAt: new Date(Date.now() - 3600000 * 14).toISOString(),
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 14).toISOString(),
          action: "REJECTED in Review: Measurement discrepancy in MB Book sheet 14. Bund compaction test report missing. Routed to EDIT.",
          performedBy: "Anil Mehta (Accounts & Finance Lead)"
        }
      ]
    }
  ],
  [
    "BILL-1003",
    {
      id: "BILL-1003",
      towerId: "TWR-103",
      projectName: "Koramangala Valley Culvert 3 Desilting",
      projectType: "STANDARD",
      workflowStatus: "INVOICE", // In INVOICE stage (Approved from Review!)
      currentStep: 8,
      amount: "₹ 58,20,000",
      amountNum: 5820000,
      contractor: "Apex Urban Engineering Corp",
      ward: "Ward 68, Koramangala",
      mbNumber: "MB-2026/068-C",
      description: "Deep channel hydraulic desilting, RCC retaining wall strengthening, and silt trap construction.",
      invoiceData: {
        invoiceNo: "INV-2026-BBMP-089",
        invoiceDate: new Date(Date.now() - 3600000 * 8).toISOString(),
        gross: 5820000,
        gstTds: 116400,
        itTds: 116400,
        laborCess: 58200,
        retention: 291000,
        totalDeductions: 582000,
        netPayable: 5238000
      },
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-103"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-103"].map((p) => p.url),
      documents: [],
      history: [
        {
          step: 1,
          startedAt: new Date(Date.now() - 3600000 * 60).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 40).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 60).toISOString(),
          action: "Billing created & submitted",
          performedBy: "Dr. Priya Sharma"
        },
        {
          step: 7,
          startedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 8).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          action: "APPROVED in Review by Joint Commissioner & Executive Engineer",
          performedBy: "Rajesh Kumar (System Administrator)"
        },
        {
          step: 8,
          startedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
          action: "Tax Invoice #INV-2026-BBMP-089 Generated. Net Payable: ₹ 52,38,000. Ready for Payment.",
          performedBy: "Anil Mehta (Accounts & Finance Lead)"
        }
      ]
    }
  ],
  [
    "BILL-1004",
    {
      id: "BILL-1004",
      towerId: "TWR-104",
      projectName: "Yelahanka Wetland Bio-Fencing & Ecology Tower",
      projectType: "BBMP_LAKES",
      workflowStatus: "PAID", // In PAID stage (Payment confirmed, ready to Close)
      currentStep: 12,
      amount: "₹ 42,00,000",
      amountNum: 4200000,
      contractor: "GreenTech Eco Solutions",
      ward: "Ward 05, Yelahanka",
      mbNumber: "MB-2026/005-E",
      description: "Native wetland planting, bio-fencing perimeter, solar power installation on monitoring mast.",
      invoiceData: {
        invoiceNo: "INV-2026-BBMP-044",
        invoiceDate: new Date(Date.now() - 3600000 * 48).toISOString(),
        gross: 4200000,
        gstTds: 84000,
        itTds: 84000,
        laborCess: 42000,
        retention: 210000,
        totalDeductions: 420000,
        netPayable: 3780000
      },
      paymentData: {
        utrNumber: "SBIN2026092688419",
        paidDate: new Date(Date.now() - 3600000 * 4).toISOString(),
        paymentMode: "RTGS Electronic Clearing",
        bankName: "State Bank of India - BBMP Treasury Branch",
        amountPaid: 3780000,
        voucherId: "VCH-2026-00921"
      },
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-104"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-104"].map((p) => p.url),
      documents: [],
      history: [
        {
          step: 12,
          startedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          action: "Payment Disbursed via RTGS. UTR #SBIN2026092688419. Amount: ₹ 37,80,000",
          performedBy: "Anil Mehta (Accounts & Finance Lead)"
        }
      ]
    }
  ],
  [
    "BILL-1005",
    {
      id: "BILL-1005",
      towerId: "TWR-105",
      projectName: "Whitefield Sluice Gate Automation Overhaul",
      projectType: "STANDARD",
      workflowStatus: "SUBMITTED", // Freshly SUBMITTED, awaiting review pickup
      currentStep: 2,
      amount: "₹ 24,80,000",
      amountNum: 2480000,
      contractor: "Vanguard Infra Ventures",
      ward: "Ward 84, Mahadevapura",
      mbNumber: "MB-2026/084-F",
      description: "Hydraulic actuator replacement, sensor calibration, and telemetry gateway commissioning.",
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-105"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-105"].map((p) => p.url),
      documents: [],
      history: [
        {
          step: 2,
          startedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          action: "Billing dossier submitted officially. Ready for Technical Scrutiny.",
          performedBy: "Dr. Priya Sharma (Field Officer (AEE))"
        }
      ]
    }
  ],
  [
    "BILL-1006",
    {
      id: "BILL-1006",
      towerId: "TWR-101",
      projectName: "Bellandur Inflow Silt Weir Phase 1 (Completed)",
      projectType: "BBMP_LAKES",
      workflowStatus: "CLOSED", // Fully CLOSED lifecycle
      currentStep: 12,
      amount: "₹ 65,00,000",
      amountNum: 6500000,
      contractor: "Sri Sai Infratech Projects",
      ward: "Ward 42, Bellandur",
      mbNumber: "MB-2025/042-Z",
      description: "Completed masonry weir construction, boulder pitching, and permanent discharge spillway.",
      invoiceData: {
        invoiceNo: "INV-2025-BBMP-992",
        invoiceDate: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
        gross: 6500000,
        gstTds: 130000,
        itTds: 130000,
        laborCess: 65000,
        retention: 325000,
        totalDeductions: 650000,
        netPayable: 5850000
      },
      paymentData: {
        utrNumber: "SBIN2025112001928",
        paidDate: new Date(Date.now() - 3600000 * 24 * 25).toISOString(),
        paymentMode: "RTGS Electronic Clearing",
        bankName: "State Bank of India - BBMP Treasury Branch",
        amountPaid: 5850000,
        voucherId: "VCH-2025-00781"
      },
      closedAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
      closedBy: "Rajesh Kumar (System Administrator)",
      photos: JSON.parse(JSON.stringify(SITE_INSPECTION_PHOTOS["TWR-106"])),
      photoUrls: SITE_INSPECTION_PHOTOS["TWR-106"].map((p) => p.url),
      documents: [],
      history: [
        {
          step: 12,
          startedAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
          dueAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
          savedAt: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
          action: "FILE PERMANENTLY CLOSED & SEALED. Statutory audit and reconciliation finished.",
          performedBy: "Rajesh Kumar (System Administrator)"
        }
      ]
    }
  ]
]);

function stagesFor(bill) {
  return workflows[bill.projectType] || workflows.STANDARD;
}

// Auth endpoints
app.post("/api/auth/login", (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: "Username/email and password are required." });
  }

  const query = identifier.trim().toLowerCase();
  const user = users.find(
    (u) =>
      u.email.toLowerCase() === query ||
      u.username.toLowerCase() === query ||
      (u.username === "billing_admin" && (query === "admin" || query === "admin@billing.gov"))
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username/email or password." });
  }

  const token = createSession(user.id);
  const { passwordHash: _, ...safeUser } = user;

  res.json({
    message: "Login successful",
    token,
    user: safeUser
  });
});

app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    sessions.delete(token);
  }
  res.json({ message: "Successfully logged out." });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Demo accounts endpoint so frontend can display available demo roles for easy testing
app.get("/api/auth/demo-users", (_req, res) => {
  const demoList = users.map((u) => ({
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    department: u.department,
    badgeColor: u.badgeColor,
    samplePassword: "Admin@Tower2026"
  }));
  res.json(demoList);
});

// Helper to scan disk and ensure all uploaded PDFs are analyzed
async function ensureBillDocumentsAnalyzed(bill) {
  if (!bill.documents) bill.documents = [];

  try {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      if (f.toLowerCase().endsWith(".pdf")) {
        const filePath = path.join(uploadsDir, f);
        const existsInBill = bill.documents.find((d) => d.url && d.url.includes(f));
        if (!existsInBill) {
          try {
            const stats = fs.statSync(filePath);
            const buf = fs.readFileSync(filePath);
            const cleanName = f.replace(/^\d+_/, "");
            const analysis = await analyzePdfDocument(buf, cleanName, stats.size);
            bill.documents.push({
              id: `doc_${crypto.randomUUID()}`,
              name: cleanName,
              type: "pdf",
              extension: "PDF",
              size: stats.size,
              uploadedAt: stats.mtime.toISOString(),
              uploadedBy: "Administrative / Project Records",
              url: `/uploads/${f}`,
              pdfAnalysis: analysis
            });
          } catch (fileErr) {
            console.warn(`Could not read/analyze ${f}:`, fileErr.message);
          }
        }
      }
    }
  } catch (dirErr) {
    console.warn("Could not scan uploads dir:", dirErr.message);
  }

  // Ensure any existing PDF doc lacking pdfAnalysis is analyzed
  for (const doc of bill.documents) {
    if (doc.type === "pdf" && !doc.pdfAnalysis && doc.url) {
      try {
        const fileNameOnDisk = path.basename(doc.url);
        const diskPath = path.join(uploadsDir, fileNameOnDisk);
        if (fs.existsSync(diskPath)) {
          const buf = fs.readFileSync(diskPath);
          doc.pdfAnalysis = await analyzePdfDocument(buf, doc.name, doc.size || buf.length);
        }
      } catch (err) {
        console.warn(`Could not analyze existing doc ${doc.name}:`, err.message);
      }
    }
  }
}

// Workflow and Bill endpoints
app.get("/api/workflows", (_req, res) => res.json(workflows));

// ========================================================
// TOWER MASTER ENDPOINTS
// ========================================================
app.get("/api/towers", requireAuth, (_req, res) => {
  const list = Array.from(towers.values()).map((t) => {
    // Calculate aggregate bills for this tower
    const towerBills = Array.from(bills.values()).filter((b) => b.towerId === t.id);
    const totalBilledNum = towerBills.reduce((acc, b) => acc + (b.amountNum || parseCurrency(b.amount)), 0);
    const paidBills = towerBills.filter((b) => b.workflowStatus === "PAID" || b.workflowStatus === "CLOSED");
    const totalPaidNum = paidBills.reduce((acc, b) => acc + (b.paymentData?.amountPaid || b.amountNum || parseCurrency(b.amount)), 0);
    
    return {
      ...t,
      billCount: towerBills.length,
      totalBilled: `₹ ${totalBilledNum.toLocaleString("en-IN")}`,
      totalBilledNum,
      totalPaid: `₹ ${totalPaidNum.toLocaleString("en-IN")}`,
      totalPaidNum,
      activeBills: towerBills.filter((b) => b.workflowStatus !== "CLOSED").length
    };
  });
  res.json(list);
});

app.post("/api/towers", requireAuth, (req, res) => {
  const { code, name, ward, zone, contractor, budget, location, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Tower Name is required." });
  }

  const nextNum = towers.size + 101;
  const towerId = `TWR-${nextNum}`;
  const towerCode = code?.trim() || `TWR-GEN-${nextNum}`;
  const budgetNum = parseCurrency(budget) || 5000000;

  const newTower = {
    id: towerId,
    code: towerCode,
    name: name.trim(),
    ward: ward?.trim() || "BBMP Central Ward",
    zone: zone?.trim() || "Central Zone",
    contractor: contractor?.trim() || "BBMP Registered Vendor",
    budget: budget?.trim() || `₹ ${budgetNum.toLocaleString("en-IN")}`,
    budgetNum,
    location: location?.trim() || "BBMP Municipal Ward Sector",
    status: "ACTIVE",
    description: description?.trim() || "Infrastructure & Drainage Tower",
    createdAt: new Date().toISOString()
  };

  towers.set(towerId, newTower);
  res.status(201).json({
    message: `Tower "${newTower.name}" registered successfully!`,
    tower: newTower
  });
});

// ========================================================
// BILLS & WORKFLOW ENDPOINTS
// ========================================================

// List all bills summary with full workflow metadata
app.get("/api/bills", requireAuth, (_req, res) => {
  const list = Array.from(bills.values()).map((b) => {
    const tower = towers.get(b.towerId);
    return {
      id: b.id,
      towerId: b.towerId || null,
      towerCode: tower?.code || "TWR-GEN",
      towerName: tower?.name || "General Tower",
      projectName: b.projectName,
      projectType: b.projectType,
      workflowStatus: b.workflowStatus || "UNDER_REVIEW",
      rejectionReason: b.rejectionReason || null,
      rejectedBy: b.rejectedBy || null,
      rejectedAt: b.rejectedAt || null,
      invoiceData: b.invoiceData || null,
      paymentData: b.paymentData || null,
      closedAt: b.closedAt || null,
      closedBy: b.closedBy || null,
      currentStep: b.currentStep,
      totalSteps: stagesFor(b).length,
      amount: b.amount || "₹ 45,50,000",
      amountNum: b.amountNum || parseCurrency(b.amount),
      contractor: b.contractor || "BBMP Certified Vendor",
      ward: b.ward || "General Municipality",
      mbNumber: b.mbNumber || "",
      description: b.description || "",
      documentsCount: (b.documents || []).length,
      historyCount: (b.history || []).length
    };
  });
  res.json(list);
});

// CREATE BILLING (Form to initiate a new billing for a Tower)
app.post("/api/bills", requireAuth, (req, res) => {
  const {
    id,
    towerId,
    projectName,
    projectType = "BBMP_LAKES",
    amount = "₹ 35,00,000",
    contractor = "",
    ward = "",
    mbNumber = "",
    description = "",
    submitImmediately = false,
    photoUrls
  } = req.body;

  if (!projectName || !projectName.trim()) {
    return res.status(400).json({ error: "Project name is required" });
  }

  let billId = (id || "").trim().toUpperCase();
  if (!billId) {
    let nextNum = 1002;
    while (bills.has(`BILL-${nextNum}`)) {
      nextNum++;
    }
    billId = `BILL-${nextNum}`;
  } else if (!billId.startsWith("BILL-")) {
    billId = `BILL-${billId}`;
  }

  if (bills.has(billId)) {
    return res.status(409).json({ error: `Bill ID "${billId}" already exists.` });
  }

  const validProjectType = workflows[projectType] ? projectType : "BBMP_LAKES";
  const stages = workflows[validProjectType];
  const numAmount = parseCurrency(amount) || 3500000;
  const formattedAmount = `₹ ${numAmount.toLocaleString("en-IN")}`;

  // Find tower if provided
  const matchedTower = towerId ? towers.get(towerId) : null;
  const resolvedTowerId = matchedTower ? matchedTower.id : "TWR-101";

  const defaultSitePhotos = getDefaultSitePhotosForTower(resolvedTowerId, projectName, ward);
  const resolvedPhotos = Array.isArray(photoUrls) && photoUrls.length > 0
    ? photoUrls.map((u, i) => ({
        id: `p-${billId}-${i + 1}`,
        url: typeof u === "string" ? u : u.url,
        title: (typeof u === "object" && u.title) || `Site Photo ${i + 1}`,
        caption: (typeof u === "object" && u.caption) || `Inspection documentation for ${projectName.trim()}`,
        siteLocation: (typeof u === "object" && u.siteLocation) || ward.trim() || matchedTower?.ward || "Site Location",
        stage: (typeof u === "object" && u.stage) || "Step 1 — Docket Initiation",
        uploadedBy: `${req.user.name} (${req.user.role})`,
        uploadedAt: new Date().toISOString(),
        geoTag: (typeof u === "object" && u.geoTag) || "12.9716° N, 77.5946° E"
      }))
    : defaultSitePhotos;

  const now = new Date();
  const due = new Date(now.getTime() + 2 * 86400000);

  // Workflow status: if submitImmediately then "UNDER_REVIEW", else "DRAFT" or "SUBMITTED"
  const initialWorkflowStatus = submitImmediately ? "UNDER_REVIEW" : "SUBMITTED";
  const initialStep = submitImmediately ? 2 : 1;

  const newBill = {
    id: billId,
    towerId: resolvedTowerId,
    projectName: projectName.trim(),
    projectType: validProjectType,
    workflowStatus: initialWorkflowStatus,
    currentStep: initialStep,
    amount: formattedAmount,
    amountNum: numAmount,
    contractor: contractor.trim() || matchedTower?.contractor || "State Public Works Contractor",
    ward: ward.trim() || matchedTower?.ward || "Municipal Division",
    mbNumber: mbNumber.trim() || `MB-2026/${Math.floor(100 + Math.random() * 900)}`,
    description: description.trim() || `Billing initiated for Tower ${matchedTower?.code || resolvedTowerId}`,
    photos: resolvedPhotos,
    photoUrls: resolvedPhotos.map((p) => p.url),
    documents: [],
    history: [
      {
        step: 1,
        startedAt: now.toISOString(),
        dueAt: due.toISOString(),
        savedAt: now.toISOString(),
        action: `Billing docket initiated under Tower ${matchedTower?.name || resolvedTowerId}`,
        performedBy: `${req.user.name} (${req.user.role})`
      }
    ]
  };

  if (submitImmediately) {
    newBill.history.push({
      step: 2,
      startedAt: now.toISOString(),
      dueAt: due.toISOString(),
      savedAt: now.toISOString(),
      action: "Submitted immediately into Departmental Review Queue",
      performedBy: `${req.user.name} (${req.user.role})`
    });
  }

  bills.set(billId, newBill);

  res.status(201).json({
    message: `Bill "${billId}" created successfully!`,
    bill: { ...newBill, stages }
  });
});

// SUBMIT BILLING (Advances bill from DRAFT / SUBMITTED to UNDER_REVIEW)
app.post("/api/bills/:id/submit", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const now = new Date();
  bill.workflowStatus = "UNDER_REVIEW";
  bill.currentStep = Math.max(bill.currentStep, 2);

  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
    savedAt: now.toISOString(),
    action: `Billing dossier officially SUBMITTED for departmental technical & financial review`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Bill "${bill.id}" has been submitted for review!`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// REVIEW DECISION (Approve -> INVOICE, or Reject -> EDIT)
app.post("/api/bills/:id/review", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const { decision, remarks } = req.body;
  const now = new Date();
  const stages = stagesFor(bill);

  if (decision === "approve") {
    // Approve branch: Transitions to INVOICE
    bill.workflowStatus = "INVOICE";
    bill.rejectionReason = null;
    bill.currentStep = Math.max(bill.currentStep, 7); // Move to Invoice stage

    const breakdown = computeInvoiceBreakdown(bill.amountNum || bill.amount);
    bill.invoiceData = {
      invoiceNo: `INV-2026-BBMP-${Math.floor(100 + Math.random() * 900)}`,
      invoiceDate: now.toISOString(),
      ...breakdown,
      approvedBy: `${req.user.name} (${req.user.role})`,
      approvalRemarks: remarks || "Approved for invoicing and pre-audit pass order."
    };

    bill.history.push({
      step: bill.currentStep,
      startedAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
      savedAt: now.toISOString(),
      action: `APPROVED in Review. Generated Tax Invoice #${bill.invoiceData.invoiceNo}. Remarks: ${remarks || "None"}`,
      performedBy: `${req.user.name} (${req.user.role})`
    });

    return res.json({
      message: `Bill "${bill.id}" APPROVED! Generated Tax Invoice #${bill.invoiceData.invoiceNo}.`,
      bill: { ...bill, stages }
    });
  } else if (decision === "reject") {
    // Reject branch: Transitions to EDIT
    if (!remarks || !remarks.trim()) {
      return res.status(400).json({ error: "A clear rejection reason is required when rejecting a bill." });
    }

    bill.workflowStatus = "REJECTED_EDIT";
    bill.rejectionReason = remarks.trim();
    bill.rejectedBy = `${req.user.name} (${req.user.role})`;
    bill.rejectedAt = now.toISOString();

    bill.history.push({
      step: bill.currentStep,
      startedAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 86400000).toISOString(),
      savedAt: now.toISOString(),
      action: `REJECTED in Review by ${req.user.name}. Reason: ${remarks.trim()}. Routed to EDIT for revision.`,
      performedBy: `${req.user.name} (${req.user.role})`
    });

    return res.json({
      message: `Bill "${bill.id}" REJECTED and routed to EDIT for revision.`,
      bill: { ...bill, stages }
    });
  } else {
    return res.status(400).json({ error: "Invalid review decision. Must be 'approve' or 'reject'." });
  }
});

// EDIT BILLING (Save edits during REJECTED_EDIT or DRAFT)
app.put("/api/bills/:id/edit", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const { projectName, amount, contractor, ward, mbNumber, description } = req.body;

  if (projectName && projectName.trim()) bill.projectName = projectName.trim();
  if (contractor && contractor.trim()) bill.contractor = contractor.trim();
  if (ward && ward.trim()) bill.ward = ward.trim();
  if (mbNumber && mbNumber.trim()) bill.mbNumber = mbNumber.trim();
  if (description && description.trim()) bill.description = description.trim();

  if (amount) {
    const num = parseCurrency(amount);
    bill.amountNum = num;
    bill.amount = `₹ ${num.toLocaleString("en-IN")}`;
  }

  const now = new Date();
  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + 86400000).toISOString(),
    savedAt: now.toISOString(),
    action: `Bill details modified during EDIT stage by ${req.user.name}`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Bill "${bill.id}" updated successfully.`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// RESUBMIT BILLING (From EDIT back to UNDER_REVIEW)
app.post("/api/bills/:id/resubmit", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const { revisionNote } = req.body;
  const now = new Date();

  bill.workflowStatus = "UNDER_REVIEW";
  const priorReason = bill.rejectionReason;
  bill.rejectionReason = null; // Cleared active rejection
  bill.lastRevisionNote = revisionNote || "Rectified objections and updated verification sheets.";

  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
    savedAt: now.toISOString(),
    action: `RESUBMITTED for Review after corrections. Rectification: ${bill.lastRevisionNote} (Previous rejection: ${priorReason || "N/A"})`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Bill "${bill.id}" successfully resubmitted for review!`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// PROCEED FROM INVOICE TO PAYMENT
app.post("/api/bills/:id/proceed-to-payment", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const now = new Date();
  bill.workflowStatus = "PAYMENT";
  bill.currentStep = Math.max(bill.currentStep, 10);

  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
    savedAt: now.toISOString(),
    action: `Tax Invoice approved. Transmitted to Central Treasury for Electronic Fund Transfer (PAYMENT stage).`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Bill "${bill.id}" advanced to PAYMENT stage!`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// RECORD PAYMENT (Moves from PAYMENT to PAID)
app.post("/api/bills/:id/record-payment", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const { utrNumber, paymentMode, bankName, amountPaid, remarks } = req.body;
  if (!utrNumber || !utrNumber.trim()) {
    return res.status(400).json({ error: "Bank UTR / Transaction Reference Number is required." });
  }

  const now = new Date();
  bill.workflowStatus = "PAID";
  bill.currentStep = Math.max(bill.currentStep, 12);

  const netPayable = bill.invoiceData?.netPayable || bill.amountNum || parseCurrency(bill.amount);
  bill.paymentData = {
    utrNumber: utrNumber.trim(),
    paymentMode: paymentMode?.trim() || "RTGS Electronic Clearing",
    bankName: bankName?.trim() || "State Bank of India - BBMP Treasury Branch",
    amountPaid: amountPaid ? parseCurrency(amountPaid) : netPayable,
    paidDate: now.toISOString(),
    voucherId: `VCH-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    remarks: remarks?.trim() || "Disbursement cleared via Treasury."
  };

  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + 86400000).toISOString(),
    savedAt: now.toISOString(),
    action: `PAYMENT CLEARED. UTR #${bill.paymentData.utrNumber}, Net Disbursed: ₹ ${bill.paymentData.amountPaid.toLocaleString("en-IN")}. Status: PAID`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Payment confirmed for Bill "${bill.id}"! Status updated to PAID.`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// CLOSE BILLING (Moves from PAID to CLOSED)
app.post("/api/bills/:id/close-bill", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const now = new Date();
  bill.workflowStatus = "CLOSED";
  bill.closedAt = now.toISOString();
  bill.closedBy = `${req.user.name} (${req.user.role})`;

  bill.history.push({
    step: bill.currentStep,
    startedAt: now.toISOString(),
    dueAt: now.toISOString(),
    savedAt: now.toISOString(),
    action: `BILL CLOSED & ARCHIVED. Digital seal and audit verification permanently finalized.`,
    performedBy: bill.closedBy
  });

  res.json({
    message: `Bill "${bill.id}" successfully CLOSED & ARCHIVED!`,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// REPORTS API (Comprehensive aggregated analytics and reports across all workflow stages)
app.get("/api/reports", requireAuth, (_req, res) => {
  const allBills = Array.from(bills.values()).map((b) => {
    const tower = towers.get(b.towerId);
    const gross = b.amountNum || parseCurrency(b.amount);
    const net = b.invoiceData?.netPayable || b.paymentData?.amountPaid || gross;
    return {
      id: b.id,
      towerId: b.towerId || "TWR-101",
      towerCode: tower?.code || "TWR-GEN",
      towerName: tower?.name || "General Tower",
      ward: b.ward,
      projectName: b.projectName,
      contractor: b.contractor,
      workflowStatus: b.workflowStatus || "UNDER_REVIEW",
      currentStep: b.currentStep,
      grossAmount: gross,
      netAmount: net,
      formattedGross: `₹ ${gross.toLocaleString("en-IN")}`,
      formattedNet: `₹ ${net.toLocaleString("en-IN")}`,
      invoiceNo: b.invoiceData?.invoiceNo || "-",
      utrNumber: b.paymentData?.utrNumber || "-",
      rejectionReason: b.rejectionReason || null,
      rejectedBy: b.rejectedBy || null,
      historyCount: (b.history || []).length,
      lastUpdated: b.history?.[b.history.length - 1]?.savedAt || new Date().toISOString()
    };
  });

  // Calculate workflow funnel counts
  const stageCounts = {
    DRAFT: allBills.filter((b) => b.workflowStatus === "DRAFT").length,
    SUBMITTED: allBills.filter((b) => b.workflowStatus === "SUBMITTED").length,
    UNDER_REVIEW: allBills.filter((b) => b.workflowStatus === "UNDER_REVIEW").length,
    REJECTED_EDIT: allBills.filter((b) => b.workflowStatus === "REJECTED_EDIT").length,
    INVOICE: allBills.filter((b) => b.workflowStatus === "INVOICE").length,
    PAYMENT: allBills.filter((b) => b.workflowStatus === "PAYMENT").length,
    PAID: allBills.filter((b) => b.workflowStatus === "PAID").length,
    CLOSED: allBills.filter((b) => b.workflowStatus === "CLOSED").length,
    TOTAL: allBills.length
  };

  // Financial sums
  const totalGrossBilled = allBills.reduce((acc, b) => acc + b.grossAmount, 0);
  const totalPaid = allBills
    .filter((b) => b.workflowStatus === "PAID" || b.workflowStatus === "CLOSED")
    .reduce((acc, b) => acc + b.netAmount, 0);
  const totalInReview = allBills
    .filter((b) => b.workflowStatus === "UNDER_REVIEW")
    .reduce((acc, b) => acc + b.grossAmount, 0);
  const totalInvoiced = allBills
    .filter((b) => b.workflowStatus === "INVOICE" || b.workflowStatus === "PAYMENT")
    .reduce((acc, b) => acc + b.netAmount, 0);

  // Rejection rate calculation
  const totalReviewed = stageCounts.UNDER_REVIEW + stageCounts.REJECTED_EDIT + stageCounts.INVOICE + stageCounts.PAYMENT + stageCounts.PAID + stageCounts.CLOSED;
  const rejectionRate = totalReviewed > 0 ? Math.round((stageCounts.REJECTED_EDIT / totalReviewed) * 100) : 0;

  res.json({
    summary: {
      totalGrossBilled: `₹ ${totalGrossBilled.toLocaleString("en-IN")}`,
      totalGrossBilledNum: totalGrossBilled,
      totalPaid: `₹ ${totalPaid.toLocaleString("en-IN")}`,
      totalPaidNum: totalPaid,
      totalInReview: `₹ ${totalInReview.toLocaleString("en-IN")}`,
      totalInvoiced: `₹ ${totalInvoiced.toLocaleString("en-IN")}`,
      rejectionRate: `${rejectionRate}%`,
      stageCounts
    },
    towersCount: towers.size,
    bills: allBills
  });
});

app.get("/api/bills/:id", requireAuth, async (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!bill.documents) bill.documents = [];

  // Ensure bill.photos is populated with site-specific inspection photos
  if (!bill.photos || !Array.isArray(bill.photos) || bill.photos.length === 0) {
    if (bill.photoUrls && bill.photoUrls.length > 0) {
      bill.photos = bill.photoUrls.map((p, i) => ({
        id: `photo-${bill.id}-${i + 1}`,
        url: typeof p === "string" ? p : p.url,
        title: (typeof p === "object" && p.title) || `Site Photo ${i + 1}`,
        caption: (typeof p === "object" && p.caption) || `Inspection documentation for ${bill.projectName}`,
        siteLocation: (typeof p === "object" && p.siteLocation) || bill.ward || bill.projectName,
        stage: (typeof p === "object" && p.stage) || `Step ${bill.currentStep}`,
        uploadedBy: (typeof p === "object" && p.uploadedBy) || "Field Inspection Team",
        uploadedAt: (typeof p === "object" && p.uploadedAt) || new Date().toISOString(),
        geoTag: (typeof p === "object" && p.geoTag) || "12.9716° N, 77.5946° E"
      }));
    } else {
      bill.photos = getDefaultSitePhotosForTower(bill.towerId, bill.projectName, bill.ward);
      bill.photoUrls = bill.photos.map((p) => p.url);
    }
  }

  await ensureBillDocumentsAnalyzed(bill);
  res.json({ ...bill, stages: stagesFor(bill) });
});

// ATTACH / UPLOAD NEW SITE INSPECTION PHOTO SPECIFIC TO THIS SITE
app.post("/api/bills/:id/photos", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const {
    url,
    photoData,
    title,
    caption,
    stage,
    siteLocation,
    geoTag
  } = req.body;

  const photoUrl = (url && url.trim()) || photoData;
  if (!photoUrl) {
    return res.status(400).json({ error: "Photo image file or valid image URL is required." });
  }

  if (!bill.photos || !Array.isArray(bill.photos)) {
    bill.photos = getDefaultSitePhotosForTower(bill.towerId, bill.projectName, bill.ward);
  }

  const newPhotoId = `photo-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newPhoto = {
    id: newPhotoId,
    url: photoUrl,
    title: (title && title.trim()) || `Site Photo ${bill.photos.length + 1}`,
    caption: (caption && caption.trim()) || `Field inspection photographic evidence for ${bill.projectName}`,
    siteLocation: (siteLocation && siteLocation.trim()) || bill.ward || bill.projectName,
    stage: (stage && stage.trim()) || `Step ${bill.currentStep}`,
    geoTag: (geoTag && geoTag.trim()) || "12.9716° N, 77.5946° E",
    uploadedBy: `${req.user.name} (${req.user.role})`,
    uploadedAt: new Date().toISOString()
  };

  bill.photos.push(newPhoto);
  bill.photoUrls = bill.photos.map((p) => p.url);

  bill.history.push({
    step: bill.currentStep,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: `[Site Inspection Photo Attached] ${newPhoto.title} (${newPhoto.siteLocation})`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.status(201).json({
    message: `Site inspection photo "${newPhoto.title}" attached successfully!`,
    photo: newPhoto,
    photos: bill.photos,
    photoUrls: bill.photoUrls,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

// DELETE SITE INSPECTION PHOTO
app.delete("/api/bills/:id/photos/:photoId", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  if (!bill.photos || bill.photos.length === 0) {
    return res.status(404).json({ error: "No photos found on this bill." });
  }

  const pIdx = bill.photos.findIndex((p) => p.id === req.params.photoId || p.url === req.params.photoId);
  if (pIdx === -1) {
    return res.status(404).json({ error: "Photo not found." });
  }

  if (bill.photos.length <= 1) {
    return res.status(400).json({ error: "Cannot delete the last remaining site photo. A bill must maintain at least one inspection record photo." });
  }

  const removed = bill.photos.splice(pIdx, 1)[0];
  bill.photoUrls = bill.photos.map((p) => p.url);

  bill.history.push({
    step: bill.currentStep,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: `[Site Inspection Photo Removed] ${removed.title || "Inspection photo"}`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `Photo "${removed.title}" deleted successfully.`,
    photos: bill.photos,
    photoUrls: bill.photoUrls,
    bill: { ...bill, stages: stagesFor(bill) }
  });
});

app.post("/api/bills/:id/transition", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const requested = Number(req.body.step);
  const stages = stagesFor(bill);

  if (!Number.isInteger(requested) || requested < 1 || requested > stages.length) {
    return res.status(400).json({ error: "Invalid workflow step" });
  }

  if (requested < bill.currentStep) {
    return res.status(409).json({
      error: `Forward-only rule: bill is already at Step ${bill.currentStep}.`
    });
  }

  if (requested === bill.currentStep) {
    return res.json({ ...bill, stages, message: "No transition required." });
  }

  const now = new Date();
  const due = new Date(now.getTime() + 2 * 86400000);
  bill.currentStep = requested;
  bill.history.push({
    step: requested,
    startedAt: now.toISOString(),
    dueAt: due.toISOString(),
    savedAt: now.toISOString(),
    action: `Approved & Transitioned to Step ${requested}`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    ...bill,
    stages,
    transitionId: crypto.randomUUID(),
    message: `Moved to Step ${requested}: ${stages[requested - 1]} by ${req.user.name}`
  });
});

app.post("/api/bills/:id/reset", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const stages = stagesFor(bill);
  bill.currentStep = 1;
  bill.history = [{
    step: 1,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: "Workflow reset to Step 1: " + stages[0],
    performedBy: `${req.user.name} (${req.user.role})`
  }];

  res.json({
    ...bill,
    stages,
    message: "Workflow reset to Step 1: " + stages[0]
  });
});

app.get("/api/bills/:id/audit", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  res.json(bill.history);
});

// Manually log inspection or verification note in audit trail
app.post("/api/bills/:id/audit-entry", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const { note, step, actionType = "Physical Field Verification" } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: "Inspection note text is required." });
  }

  const targetStep = Number(step) || bill.currentStep;
  const now = new Date();
  const due = new Date(now.getTime() + 2 * 86400000);

  const entry = {
    step: targetStep,
    startedAt: now.toISOString(),
    dueAt: due.toISOString(),
    savedAt: now.toISOString(),
    action: `[${actionType}] ${note.trim()}`,
    performedBy: `${req.user.name} (${req.user.role})`
  };

  bill.history.push(entry);

  res.status(201).json({
    message: "Inspection note recorded in audit log.",
    entry,
    history: bill.history
  });
});

// Manually add a Document / Invoice / Measurement record
app.post("/api/bills/:id/documents/manual", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!bill.documents) bill.documents = [];

  const {
    name,
    category = "Invoice / Bill",
    refNumber = "",
    amount = "",
    step,
    issuingAuthority = "",
    date = new Date().toISOString(),
    remarks = "",
    items = []
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Document or Record Title is required." });
  }

  const uniqueDocId = `man_${crypto.randomUUID()}`;
  const newManualDoc = {
    id: uniqueDocId,
    name: name.trim(),
    type: "manual",
    category: category,
    refNumber: refNumber.trim() || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
    amount: amount.trim(),
    associatedStep: Number(step) || bill.currentStep,
    issuingAuthority: issuingAuthority.trim() || req.user.name,
    recordDate: date,
    remarks: remarks.trim(),
    items: Array.isArray(items) ? items : [],
    size: 1024 * (1 + (items.length || 1)),
    uploadedAt: new Date().toISOString(),
    uploadedBy: `${req.user.name} (${req.user.role})`,
    isManual: true
  };

  bill.documents.push(newManualDoc);

  // Record in audit log
  const auditDetails = `Manually added record [${category}]: ${name.trim()} (Ref: ${newManualDoc.refNumber}${newManualDoc.amount ? `, Amount: ${newManualDoc.amount}` : ""})`;
  bill.history.push({
    step: bill.currentStep,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: auditDetails,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.status(201).json({
    message: `Record "${name}" added manually.`,
    document: newManualDoc,
    documents: bill.documents
  });
});

// Document Upload endpoint for PDF and Excel
app.post("/api/bills/:id/documents", requireAuth, async (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!bill.documents) bill.documents = [];

  const { fileName, fileData, fileSize } = req.body;
  if (!fileName || !fileData) {
    return res.status(400).json({ error: "File name and file content are required." });
  }

  const ext = path.extname(fileName).toLowerCase();
  let docType = "unknown";
  if (ext === ".pdf") {
    docType = "pdf";
  } else if ([".xlsx", ".xls", ".csv"].includes(ext)) {
    docType = "excel";
  } else {
    return res.status(400).json({
      error: "Unsupported file type. Please upload a PDF (.pdf) or Excel (.xlsx, .xls, .csv) document."
    });
  }

  // Extract base64 buffer
  let base64Clean = fileData;
  if (fileData.includes(";base64,")) {
    base64Clean = fileData.split(";base64,")[1];
  }

  const fileBuffer = Buffer.from(base64Clean, "base64");
  const uniqueDocId = `doc_${crypto.randomUUID()}`;
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageFileName = `${Date.now()}_${sanitizedName}`;
  const diskPath = path.join(uploadsDir, storageFileName);

  try {
    fs.writeFileSync(diskPath, fileBuffer);
  } catch (err) {
    return res.status(500).json({ error: "Failed to save file to server storage: " + err.message });
  }

  // Automatically perform comprehensive PDF Document Intelligence if PDF
  let pdfAnalysis = null;
  if (docType === "pdf") {
    try {
      pdfAnalysis = await analyzePdfDocument(fileBuffer, fileName, fileSize || fileBuffer.length);
    } catch (parseErr) {
      console.warn("Failed to analyze uploaded PDF:", parseErr);
    }
  }

  const newDoc = {
    id: uniqueDocId,
    name: fileName,
    type: docType,
    extension: ext.replace(".", "").toUpperCase(),
    size: fileSize || fileBuffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: `${req.user.name} (${req.user.role})`,
    url: `/uploads/${storageFileName}`,
    pdfAnalysis
  };

  bill.documents.push(newDoc);

  // Record attachment in bill audit log
  const auditDetails = pdfAnalysis
    ? `Uploaded & Extracted PDF (${pdfAnalysis.totalPages} pages, ${pdfAnalysis.stats.totalWords} words, ${pdfAnalysis.tables.length} tables): ${fileName}`
    : `Uploaded ${docType.toUpperCase()} document: ${fileName}`;

  bill.history.push({
    step: bill.currentStep,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: auditDetails,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `${fileName} uploaded and analyzed successfully.`,
    document: newDoc,
    documents: bill.documents
  });
});

// Deep PDF details inspection endpoint
app.get("/api/bills/:id/documents/:docId/analysis", requireAuth, async (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!bill.documents) bill.documents = [];

  const doc = bill.documents.find((d) => d.id === req.params.docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  if (doc.pdfAnalysis) {
    return res.json({ success: true, document: doc, analysis: doc.pdfAnalysis });
  }

  if (doc.type === "pdf" && doc.url) {
    try {
      const fileNameOnDisk = path.basename(doc.url);
      const diskPath = path.join(uploadsDir, fileNameOnDisk);
      if (fs.existsSync(diskPath)) {
        const buf = fs.readFileSync(diskPath);
        doc.pdfAnalysis = await analyzePdfDocument(buf, doc.name, doc.size || buf.length);
        return res.json({ success: true, document: doc, analysis: doc.pdfAnalysis });
      }
    } catch (e) {
      return res.status(500).json({ error: "Failed to analyze PDF document: " + e.message });
    }
  }

  return res.status(400).json({ error: "Document is not a readable PDF file" });
});

// Document Delete endpoint
app.delete("/api/bills/:id/documents/:docId", requireAuth, (req, res) => {
  const bill = bills.get(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!bill.documents) bill.documents = [];

  const index = bill.documents.findIndex((d) => d.id === req.params.docId);
  if (index === -1) {
    return res.status(404).json({ error: "Document not found" });
  }

  const [removedDoc] = bill.documents.splice(index, 1);

  // Optional: remove file from disk
  try {
    const fileNameOnDisk = path.basename(removedDoc.url);
    const diskPath = path.join(uploadsDir, fileNameOnDisk);
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }
  } catch {
    // Ignore file removal error
  }

  bill.history.push({
    step: bill.currentStep,
    startedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    savedAt: new Date().toISOString(),
    action: `Removed document: ${removedDoc.name}`,
    performedBy: `${req.user.name} (${req.user.role})`
  });

  res.json({
    message: `${removedDoc.name} deleted successfully.`,
    documents: bill.documents
  });
});

app.listen(4000, () => {
  console.log("Billing Tracker API running at http://localhost:4000");
});

// Keep the event loop alive
setInterval(() => {}, 1000 * 60 * 60);