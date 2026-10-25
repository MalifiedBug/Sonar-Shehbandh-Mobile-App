export const SUB_CASTES = [
  "Panchal Sonar / पांचाळ सोनार",
  "Lad Sonar / लाड सोनार",
  "Daivajna Sonar / दैवज्ञ सोनार",
  "Vaishya Sonar / वैश्य सोनार",
  "Malavi Sonar / मालवी सोनार",
  "Ahir Sonar / अहिर सोनार",
  "Zhadi Sonar / झाडी सोनार",
  "Deshastha Sonar / देशस्थ सोनार",
  "Azhare Sonar / अजहरे सोनार",
  "Deshi (Marathi) Sonar / देशी (मराठी) सोनार",
  "Pardeshi Sonar / परदेशी सोनार",
  "Shilawat Sonar / शिलावट सोनार",
  "Vishwabrāhman Sonar / विश्वब्राह्मण सोनार",
  "Gadhavi Bhatke Sonar / गाढवी भटक्या सोनार",
  "Takasale Sonar / टांकसाळे सोनार",
  "Kannada Sonar / कानडी सोनार",
  "Kadu Sonar / कडू सोनार",
  "Soni Sonar / सोनी सोनार",
  "Lingayat Sonar / लिंगायत सोनार",
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENDERS = ["Male / पुरुष", "Female / स्त्री", "Other / इतर"];
export const MARITAL = ["Unmarried / अविवाहित", "Married / विवाहित", "Divorced / घटस्फोटित", "Widowed / विधवा/विधुर"];

export const RASHIS = [
  "Mesh / मेष (Aries)", "Vrishabh / वृषभ (Taurus)", "Mithun / मिथुन (Gemini)", "Kark / कर्क (Cancer)",
  "Simha / सिंह (Leo)", "Kanya / कन्या (Virgo)", "Tula / तुळ (Libra)", "Vrishchik / वृश्चिक (Scorpio)",
  "Dhanu / धनु (Sagittarius)", "Makar / मकर (Capricorn)", "Kumbh / कुंभ (Aquarius)", "Meen / मीन (Pisces)",
];

export const NAKSHATRAS = [
  "Ashwini / अश्विनी", "Bharani / भरणी", "Krittika / कृत्तिका", "Rohini / रोहिणी",
  "Mrigashira / मृगशीर्ष", "Ardra / आर्द्रा", "Punarvasu / पुनर्वसु", "Pushya / पुष्य",
  "Ashlesha / आश्लेषा", "Magha / मघा", "Purva Phalguni / पूर्वा फाल्गुनी", "Uttara Phalguni / उत्तरा फाल्गुनी",
  "Hasta / हस्त", "Chitra / चित्रा", "Swati / स्वाती", "Vishakha / विशाखा",
  "Anuradha / अनुराधा", "Jyeshtha / ज्येष्ठा", "Mula / मूळ", "Purva Ashadha / पूर्वाषाढा",
  "Uttara Ashadha / उत्तराषाढा", "Shravana / श्रवण", "Dhanishta / धनिष्ठा", "Shatabhisha / शतभिषा",
  "Purva Bhadrapada / पूर्वा भाद्रपदा", "Uttara Bhadrapada / उत्तरा भाद्रपदा", "Revati / रेवती",
];

export const GOTRAS = [
  "Kashyap / कश्यप", "Bharadwaj / भारद्वाज", "Vashistha / वशिष्ठ", "Vishvamitra / विश्वामित्र", "Gautam / गौतम",
  "Jamadagni / जमदग्नी", "Atri / अत्री", "Agastya / अगस्ती", "Angiras / अंगिरस", "Koundinya / कौंडिन्य",
];

export const RELATIONS = [
  "Father / वडील", "Mother / आई", "Wife / पत्नी", "Husband / पती", "Son / मुलगा",
  "Daughter / मुलगी", "Brother / भाऊ", "Sister / बहीण", "Other / इतर",
];

export const HEIGHTS = Array.from({ length: 25 }, (_, i) => {
  const inches = 53 + i;
  return `${Math.floor(inches / 12)}'${inches % 12}" (${Math.round(inches * 2.54)} cm)`;
});

export const COMPLEXION = ["Fair / गोरा", "Wheatish / गव्हाळ", "Dusky / सावळा"];
export const CHARAN = ["1", "2", "3", "4"];
export const NADI = ["Adya / आद्य", "Madhya / मध्य", "Antya / अंत्य"];
export const GAN = ["Dev / देव", "Manushya / मनुष्य", "Rakshas / राक्षस"];
export const MANGLIK = ["No / नाही", "Yes / होय", "Saumya / सौम्य (Mild)"];
export const OCCUPATION_TYPES = ["Job / नोकरी", "Business / व्यवसाय", "Jewelry Making / सुवर्णकार", "Self-Employed / स्वयंरोजगार", "Not Working / काम करत नाही"];
export const INCOME = ["Under 2 Lakhs", "2 - 5 Lakhs", "5 - 10 Lakhs", "10 - 20 Lakhs", "20 - 50 Lakhs", "50 Lakhs+"];
export const SIBLINGS = ["0", "1", "2", "3+"];
export const FAMILY_STATUS = ["Middle Class / मध्यमवर्गीय", "Upper Middle / उच्च मध्यमवर्गीय", "Affluent / संपन्न"];
export const MAMA_RELATIONS = ["Mama / मामा", "Kaka / काका", "Mavshi / मावशी", "Aatya / आत्या"];
export const AGE_DIFF = ["1-3 years", "3-5 years", "5-7 years", "Any"];
export const DIET = ["Vegetarian / शाकाहारी", "Non-Vegetarian / मांसाहारी", "Eggetarian / अंडाळू", "Any / काहीही"];
export const BUSINESS_CATEGORIES = [
  "Jewelry Showroom / सुवर्ण दालन", "Goldsmith Workshop / सुवर्णकार कारखाना", "Bullion / सराफा", "Gemstones / रत्ने व्यापारी",
  "CAD / CAM Designing / डिझायनिंग", "Refinery / रिफायनरी", "Other Enterprise / इतर",
];
export const BIS = ["Yes / होय", "No / नाही", "Not Applicable / लागू नाही"];
export const SERVICE_YEARS = ["3-5 Years", "5-10 Years", "10-15 Years", "15+ Years"];
export const SPECIALIZATIONS = [
  "Medical Assistance / वैद्यकीय मदत", "Blood Donation / रक्तदान", "Education & Scholarships / शैक्षणिक सहाय्य",
  "Legal / Legal Aid / कायदेशीर मदत", "Matrimony Assistance / वधू-वर सहाय्य", "Disaster & Emergency Relief / आपत्कालीन मदत",
  "Elderly Care / ज्येष्ठ नागरिक सेवा",
];

export const NEWS_LEVELS = [
  { value: "village", label: "Village / गाव" },
  { value: "taluka", label: "Taluka / तालुका" },
  { value: "district", label: "District / जिल्हा" },
  { value: "state", label: "State / राज्य" },
];

export const englishPart = (s: string) => (s || "").split(" / ")[0];

export type TermsKind = "member" | "matrimony" | "business" | "social_worker" | "news";

export const TERMS: Record<TermsKind, { title: string; subtitle?: string; clauses: { h?: string; t: string }[]; decline: string; accept: string; route: string }> = {
  member: {
    title: "नियम आणि अटी / Terms & Conditions",
    subtitle: "सोनार समाज सदस्य नोंदणी / Sonar Samaj Member Registration",
    clauses: [
      { t: "This portal is strictly dedicated to individuals belonging to Sonar Samaj (सोनार समाज) and its recognized 19 sub-castes." },
      { t: "All information submitted must be accurate, truthful, and verifiable through government-issued ID proofs." },
      { t: "Misleading, offensive, or falsified information will lead to immediate cancellation of community membership and potential legal action." },
      { t: "Personal data collected will be used strictly for internal community welfare, statistics, and communication purposes." },
    ],
    decline: "Reject / अमान्य",
    accept: "Accept & Proceed / मान्य करा आणि पुढे जा",
    route: "/register/member",
  },
  matrimony: {
    title: "वधू-वर नोंदणी नियम व अटी / Matrimony Terms & Rules",
    clauses: [
      { h: "Community Restriction", t: "Both the prospective bride/groom and their families must belong to the Sonar Community." },
      { h: "Age Verification", t: "Bride must be at least 18 years old; Groom must be at least 21 years old as per Indian Law." },
      { h: "Photo Accuracy", t: "3 recent and unedited photographs must be submitted (1 close-up passport portrait, 1 full-length photo, 1 half-length photo)." },
      { h: "Marital Status Disclosure", t: "If registered under the \"Divorced / घटस्फोटित\" category, authentic court decree documents must be kept ready for verification." },
      { h: "Gotra & Kula Restriction", t: "Traditional Sagotra restrictions must be verified directly between families; the platform does not assume astrological responsibility." },
      { h: "Listing Validity", t: "Every profile registration is valid for exactly 1 year (365 days) from submission, after which profile renewal is mandatory." },
      { h: "Code of Conduct", t: "Respectful communication between families is mandatory. Unsolicited commercial use or harassment is strictly punishable." },
      { h: "Zero Guarantee", t: "The platform facilitates match-making connections only and does not verify financial or personal backgrounds of prospective alliances." },
    ],
    decline: "Disagree / असहमत",
    accept: "I Agree / मी सहमत आहे",
    route: "/register/matrimony",
  },
  business: {
    title: "व्यवसाय नोंदणी नियम / Business Directory Guidelines",
    clauses: [
      { t: "Only businesses owned, co-owned, or managed by members of the Sonar Community are eligible for listing." },
      { t: "Valid business proof is mandatory: MSME / Udyam Registration (उद्यम नोंदणी) or Shop Act License (गुमास्ता परवाना)." },
      { t: "High-resolution photos are mandatory: 1 Business Logo, 1 Outdoor / Shop Front exterior photo, and 3 Interior photos showing workshop / counter / inventory." },
      { t: "Genuine customer service: Transparent pricing and hallmarking compliance for jewelry businesses are strictly expected." },
      { t: "Fraudulent practices or customer complaints will result in delisting and blacklisting." },
      { t: "The platform holds no liability for commercial disputes between listed vendors and customers." },
    ],
    decline: "Cancel / रद्द करा",
    accept: "Agree & Register / सहमत आणि नोंदणी करा",
    route: "/register/business",
  },
  social_worker: {
    title: "समाजसेवक नोंदणी नियम / Social Worker Guidelines",
    clauses: [
      { t: "Applicant must have at least 3 to 5 years of documented, active community or public service." },
      { t: "No active political propaganda or commercial advertising can be conducted through this designation." },
      { t: "Willingness to be contacted during medical, blood donation, funeral, or educational emergencies." },
      { t: "Maintenance of high ethical standards, impartiality, and zero tolerance for caste-based sub-divisions." },
      { t: "Full contact details and permanent address must be disclosed for public verification." },
      { t: "Minimum of 2 references from verified community elders or registered Sansthas." },
      { t: "No fees, donations or gifts may be demanded from community members for any assistance provided." },
      { t: "Personal information of families helped must be kept strictly confidential." },
      { t: "Social workers must cooperate with the Sanstha committee and follow its directions during community programmes." },
      { t: "Any misuse of the Social Worker designation for personal gain will lead to immediate removal." },
      { t: "Contact details must be kept up to date; inactive listings may be removed after review." },
      { t: "The committee may revoke the designation at any time if these guidelines are breached." },
    ],
    decline: "Decline / नकार",
    accept: "Accept / स्वीकारा",
    route: "/register/social_worker",
  },
  news: {
    title: "बातम्या व AI पत्रकारिता नियमावली / News & AI Journalism Guidelines",
    clauses: [
      { t: "Automated AI summaries and regional reporting operate under strict community oversight." },
      { t: "News is categorized hierarchically: Village (गाव) → Taluka (तालुका) → District (जिल्हा) → State (राज्य)." },
      { t: "Strict prohibition of unverified hearsay, fake news, hate speech, or politically polarized material." },
      { t: "AI-generated digests must cite verifiable local community sources." },
    ],
    decline: "Back / मागे",
    accept: "Continue to News / बातम्या पहा",
    route: "/news",
  },
};

export const MORE_ITEMS = [
  { key: "flat", label: "Flat Allocation / गाळा वाटप", icon: "home-city-outline" },
  { key: "maintenance", label: "Maintenance Records / मेंटेनन्स नोंदी", icon: "tools" },
  { key: "minutes", label: "Meeting Minutes / सभेचे इतिवृत्त", icon: "file-document-outline" },
  { key: "audits", label: "Expense Audits / खर्च तपासणी", icon: "calculator-variant-outline" },
  { key: "vendors", label: "Vendor Contracts / कंत्राटदार यादी", icon: "handshake-outline" },
  { key: "assets", label: "Asset Register / मालमत्ता नोंद", icon: "archive-outline" },
  { key: "complaints", label: "Complaints & Suggestions / तक्रार व सूचना", icon: "message-alert-outline" },
] as const;
