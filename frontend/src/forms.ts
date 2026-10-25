import * as C from "@/src/constants";
import { transliterate } from "@/src/translit";

export type Opt = string | { value: string; label: string };
export type FieldType =
  | "text" | "name" | "textarea" | "phone" | "email" | "number" | "year" | "pincode"
  | "select" | "radio" | "date" | "time" | "url" | "gst" | "copy" | "repeater";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Opt[];
  placeholder?: string;
  translit?: boolean;
  maxLength?: number;
  fill?: Record<string, "taluka" | "district" | "state" | "taluka_district">;
  copy?: Record<string, string>;
  fields?: Field[];
  addLabel?: string;
  showIf?: (v: Record<string, any>) => boolean;
};

export type PhotoSpec = { key: string; label: string; shape: "circle" | "portrait" | "landscape" | "square"; required: boolean };
export type PhotoVal = { path: string; zoom: number };

export type FormDef = {
  type: string;
  title: string;
  dirTitle: string;
  titleKey: string;
  subCasteKey: string;
  photos: PhotoSpec[];
  category?: { key: string; options: { value: string; label: string }[] };
  sections: { title: string; fields: Field[] }[];
  defaults: Record<string, any>;
  consent: string;
  saveLabel: string;
  validate?: (v: Record<string, any>) => Record<string, string>;
  subtitle: (d: Record<string, any>) => string;
};

export const optValue = (o: Opt) => (typeof o === "string" ? o : o.value);
export const optLabel = (o: Opt) => (typeof o === "string" ? o : o.label);

export function parseDMY(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

export function ageOn(dob: Date, ref = new Date()) {
  let a = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) a--;
  return a;
}

const PHONE = { key: "", label: "", type: "phone" as const };
const pin = (fill: Field["fill"]): Field => ({ key: "pincode", label: "Pincode / पिनकोड", type: "pincode", required: true, fill });

// ------------------------------------------------------------------ Member
const member: FormDef = {
  type: "member",
  title: "नवीन सभासद नोंदणी / New Member Registration",
  dirTitle: "Members / सभासद",
  titleKey: "full_name",
  subCasteKey: "sub_caste",
  photos: [{ key: "avatar", label: "Profile Photo / प्रोफाइल फोटो", shape: "circle", required: false }],
  defaults: { state: "Maharashtra", family: [] },
  sections: [
    {
      title: "Personal Details / वैयक्तिक माहिती",
      fields: [
        { key: "full_name", label: "Full Name / पूर्ण नाव", type: "name", required: true, translit: true, placeholder: "उदा. गणेश दत्तात्रय सोनार" },
        { key: "sub_caste", label: "Sub-Caste / उपजात", type: "select", required: true, options: C.SUB_CASTES },
        { key: "gender", label: "Gender / लिंग", type: "select", required: true, options: C.GENDERS },
        { key: "dob", label: "Date of Birth / जन्म तारीख", type: "date", required: true },
        { key: "blood_group", label: "Blood Group / रक्त गट", type: "select", options: C.BLOOD_GROUPS },
        { key: "marital_status", label: "Marital Status / वैवाहिक स्थिती", type: "select", required: true, options: C.MARITAL },
      ],
    },
    {
      title: "Contact Information / संपर्क माहिती",
      fields: [
        { ...PHONE, key: "primary_mobile", label: "Primary Mobile Number / प्राथमिक मोबाईल", required: true },
        { ...PHONE, key: "alternate_mobile", label: "Alternate Mobile / पर्यायी मोबाईल" },
        { key: "email", label: "Email Address / ई-मेल", type: "email" },
        { key: "whatsapp_same", label: "Same as Primary Mobile / प्राथमिक मोबाईल प्रमाणे", type: "copy", copy: { primary_mobile: "whatsapp" } },
        { ...PHONE, key: "whatsapp", label: "WhatsApp Number / व्हॉट्सॲप क्रमांक" },
      ],
    },
    {
      title: "Current Residence Address / सध्याचा पत्ता",
      fields: [
        { key: "house", label: "Flat / House No. & Building / फ्लॅट/घर क्र. व इमारत", type: "text", required: true, translit: true },
        { key: "street", label: "Street / Area / रस्ता/परिसर", type: "text", required: true, translit: true },
        pin({ taluka: "taluka", district: "district", state: "state" }),
        { key: "taluka", label: "Taluka / तालुका", type: "text", required: true, translit: true },
        { key: "district", label: "District / जिल्हा", type: "text", required: true, translit: true },
        { key: "state", label: "State / राज्य", type: "text", required: true, translit: true },
      ],
    },
    {
      title: "Native Place / मूळ गाव (Permanent Address)",
      fields: [
        { key: "native_same", label: "Same as Current Address / सध्याच्या पत्त्याप्रमाणे", type: "copy", copy: { street: "native_village", taluka: "native_taluka", district: "native_district" } },
        { key: "native_village", label: "Native Village / मूळ गाव", type: "text", required: true, translit: true },
        { key: "native_taluka", label: "Native Taluka / मूळ तालुका", type: "text", required: true, translit: true },
        { key: "native_district", label: "Native District / मूळ जिल्हा", type: "text", required: true, translit: true },
        { key: "kuldaivat", label: "Kuldaivat / कुलदैवत (Family Deity)", type: "text", translit: true },
        { key: "devak", label: "Devak / देवक", type: "text", translit: true },
      ],
    },
    {
      title: "Family Members List / कुटुंबातील सदस्यांची माहिती",
      fields: [
        {
          key: "family", label: "Family Member / कुटुंब सदस्य", type: "repeater", addLabel: "+ Add Family Member / + सदस्य जोडा",
          fields: [
            { key: "name", label: "Name / नाव", type: "name", translit: true },
            { key: "relation", label: "Relation / नाते", type: "select", options: C.RELATIONS },
            { key: "age", label: "Age / वय", type: "number" },
            { key: "occupation", label: "Occupation / व्यवसाय", type: "text", translit: true },
            { key: "blood_group", label: "Blood Group / रक्त गट", type: "select", options: C.BLOOD_GROUPS },
          ],
        },
      ],
    },
    {
      title: "Emergency Contact / आणीबाणी संपर्क",
      fields: [
        { key: "emergency_name", label: "Contact Person Name / संपर्क व्यक्तीचे नाव", type: "name", required: true, translit: true },
        { key: "emergency_relation", label: "Relationship / नाते", type: "text", required: true, translit: true },
        { ...PHONE, key: "emergency_phone", label: "Emergency Phone Number / आणीबाणी फोन", required: true },
      ],
    },
  ],
  consent:
    "I hereby declare that all the information provided above is true to the best of my knowledge and I belong to Sonar Samaj. / मी याद्वारे घोषित करतो की वरील सर्व माहिती सत्य आहे आणि मी सोनार समाजाचा आहे.",
  saveLabel: "Save / सेव्ह करा",
  subtitle: (d) => [d.taluka, d.district].filter(Boolean).join(", "),
};

// ------------------------------------------------------------------ Matrimony
const MAT_CATEGORIES = [
  { value: "groom", label: "वर (Groom)" },
  { value: "bride", label: "वधू (Bride)" },
  { value: "remarriage", label: "घटस्फोटित / पुनर्विवाह (Divorced / Remarriage)" },
];

const matrimony: FormDef = {
  type: "matrimony",
  title: "वधू-वर बायोडाटा नोंदणी / Matrimony Biodata Form",
  dirTitle: "Matrimony / वधू-वर",
  titleKey: "full_name",
  subCasteKey: "sub_caste",
  category: { key: "category", options: MAT_CATEGORIES },
  photos: [
    { key: "portrait", label: "Close-up Portrait / पासपोर्ट फोटो", shape: "circle", required: true },
    { key: "full", label: "Full-Length Photo / पूर्ण फोटो", shape: "portrait", required: true },
    { key: "half", label: "Half-Length Photo / अर्ध फोटो", shape: "landscape", required: true },
  ],
  defaults: { category: "groom", relatives: [] },
  sections: [
    {
      title: "Basic & Astrological Details / मूलभूत व कुंडली माहिती",
      fields: [
        { key: "remarriage_gender", label: "Candidate / उमेदवार", type: "radio", required: true, options: ["Groom / वर", "Bride / वधू"], showIf: (v) => v.category === "remarriage" },
        { key: "full_name", label: "Full Name / उमेदवाराचे नाव", type: "name", required: true, translit: true },
        { key: "sub_caste", label: "Sub-Caste / उपजात", type: "select", required: true, options: C.SUB_CASTES },
        { key: "dob", label: "Date of Birth / जन्म तारीख", type: "date", required: true },
        { key: "tob", label: "Time of Birth / जन्म वेळ", type: "time", required: true },
        { key: "pob", label: "Place of Birth / जन्म ठिकाण", type: "text", required: true, translit: true, placeholder: "City / Village" },
        { key: "height", label: "Height / उंची", type: "select", required: true, options: C.HEIGHTS },
        { key: "blood_group", label: "Blood Group / रक्त गट", type: "select", options: C.BLOOD_GROUPS },
        { key: "complexion", label: "Complexion / वर्ण", type: "select", options: C.COMPLEXION },
        { key: "rashi", label: "Rashi / रास", type: "select", required: true, options: C.RASHIS },
        { key: "nakshatra", label: "Nakshatra / नक्षत्र", type: "select", options: C.NAKSHATRAS },
        { key: "charan", label: "Charan / चरण", type: "select", options: C.CHARAN },
        { key: "nadi", label: "Nadi / नाडी", type: "select", options: C.NADI },
        { key: "gan", label: "Gan / गण", type: "select", options: C.GAN },
        { key: "gotra", label: "Gotra / गोत्र", type: "select", required: true, options: C.GOTRAS },
        { key: "manglik", label: "Manglik / मंगळ?", type: "radio", required: true, options: C.MANGLIK },
      ],
    },
    {
      title: "Education & Career Details / शिक्षण आणि नोकरी माहिती",
      fields: [
        { key: "qualification", label: "Highest Qualification / सर्वोच्च शिक्षण", type: "text", required: true, placeholder: "e.g. B.Tech, M.Com, BE, MBA" },
        { key: "education_details", label: "Education Details / सविस्तर शिक्षण", type: "text", translit: true, placeholder: "College / University" },
        { key: "occupation_type", label: "Occupation Type / व्यवसाय प्रकार", type: "select", required: true, options: C.OCCUPATION_TYPES },
        { key: "designation", label: "Designation / हुद्दा", type: "text" },
        { key: "company", label: "Company / Business Name / कंपनी किंवा पेढीचे नाव", type: "text", translit: true },
        { key: "work_location", label: "Work Location / नोकरीचे शहर", type: "text", required: true, translit: true },
        { key: "annual_income", label: "Annual Income / वार्षिक उत्पन्न", type: "select", required: true, options: C.INCOME },
      ],
    },
    {
      title: "Family Background / कौटुंबिक पार्श्वभूमी",
      fields: [
        { key: "father_name", label: "Father's Name / वडिलांचे नाव", type: "name", required: true, translit: true },
        { key: "father_occupation", label: "Father's Occupation / वडिलांचा व्यवसाय", type: "text", translit: true },
        { key: "mother_name", label: "Mother's Name / आईचे नाव", type: "name", required: true, translit: true },
        { key: "mother_maiden", label: "Mother's Maiden Surname / आईचे माहेरचे आडनाव", type: "name", translit: true },
        { key: "brothers", label: "Total Brothers / भाऊ", type: "select", options: C.SIBLINGS },
        { key: "married_brothers", label: "Married Brothers / विवाहित भाऊ", type: "number" },
        { key: "sisters", label: "Total Sisters / बहिणी", type: "select", options: C.SIBLINGS },
        { key: "married_sisters", label: "Married Sisters / विवाहित बहिणी", type: "number" },
        { key: "family_status", label: "Family Financial Status / कौटुंबिक स्थिती", type: "select", options: C.FAMILY_STATUS },
        { key: "parental_city", label: "Parental City / पालकांचे सध्याचे शहर", type: "text", required: true, translit: true },
      ],
    },
    {
      title: "Mama / Maternal & Extended Relatives / मामा व नातेवाईक माहिती",
      fields: [
        {
          key: "relatives", label: "Relative / नातेवाईक", type: "repeater", addLabel: "+ Add Relative / + नातेवाईक जोडा",
          fields: [
            { key: "name", label: "Relative Name / नातेवाईकाचे नाव", type: "name", translit: true },
            { key: "relation", label: "Relation / नाते", type: "select", options: C.MAMA_RELATIONS },
            { key: "surnames", label: "Surnames of Relatives / नातेवाईकांची आडनावे", type: "text", translit: true, placeholder: "Comma-separated" },
            { key: "location", label: "Location / गाव/शहर", type: "text", translit: true },
          ],
        },
      ],
    },
    {
      title: "Partner Expectations / अपेक्षित जोडीदार",
      fields: [
        { key: "age_diff", label: "Preferred Age Difference / वयातील अंतर", type: "select", options: C.AGE_DIFF },
        { key: "min_height", label: "Minimum Height / किमान उंची", type: "select", options: C.HEIGHTS },
        { key: "min_education", label: "Minimum Education / किमान शिक्षण", type: "text" },
        { key: "preferred_locations", label: "Preferred Locations / पसंतीची शहरे", type: "text", translit: true },
        { key: "diet", label: "Diet Preference / खाण्याच्या सवयी", type: "select", options: C.DIET },
      ],
    },
  ],
  consent: "All biodata details are accurate and comply with the 1-year matrimony terms. / सर्व बायोडाटा माहिती अचूक असून १ वर्षाच्या वधू-वर नियमांचे पालन करते.",
  saveLabel: "Save & Generate Biodata / सेव्ह करा",
  validate: (v): Record<string, string> => {
    const dob = parseDMY(v.dob);
    if (!dob || dob > new Date()) return {};
    const isGroom = v.category === "groom" || (v.category === "remarriage" && String(v.remarriage_gender || "").startsWith("Groom"));
    const min = isGroom ? 21 : 18;
    return ageOn(dob) < min ? { dob: `${isGroom ? "Groom" : "Bride"} must be at least ${min} years old / किमान वय ${min} वर्षे` } : {};
  },
  subtitle: (d) => [d.qualification, d.work_location].filter(Boolean).join(" · "),
};

// ------------------------------------------------------------------ Business
const business: FormDef = {
  type: "business",
  title: "व्यवसाय नोंदणी अर्ज / Business Registration Form",
  dirTitle: "Business Directory / व्यवसाय सूची",
  titleKey: "firm_name",
  subCasteKey: "sub_caste",
  photos: [
    { key: "logo", label: "Business Logo / लोगो", shape: "square", required: true },
    { key: "exterior", label: "Exterior / Outdoor Front Shop Photo / बाहेरील फोटो", shape: "landscape", required: true },
    { key: "interior1", label: "Interior Photo 1 / आतील फोटो १", shape: "landscape", required: true },
    { key: "interior2", label: "Interior Photo 2 / आतील फोटो २", shape: "landscape", required: true },
    { key: "interior3", label: "Interior Photo 3 / आतील फोटो ३", shape: "landscape", required: true },
  ],
  defaults: {},
  sections: [
    {
      title: "Business Profile & Photos / व्यवसाय माहिती",
      fields: [
        { key: "firm_name", label: "Firm / Shop Name / दुकानाचे / पेढीचे नाव", type: "text", required: true, translit: true },
        { key: "category_business", label: "Business Category / व्यवसाय प्रकार", type: "select", required: true, options: C.BUSINESS_CATEGORIES },
        { key: "established_year", label: "Establishment Year / स्थापना वर्ष", type: "year", placeholder: "YYYY" },
      ],
    },
    {
      title: "Owner & Contact Information / मालक व संपर्क माहिती",
      fields: [
        { key: "owner_name", label: "Proprietor / Partner Name / मालकाचे नाव", type: "name", required: true, translit: true },
        { key: "sub_caste", label: "Sub-Caste / उपजात", type: "select", required: true, options: C.SUB_CASTES },
        { ...PHONE, key: "phone1", label: "Contact Number 1 / फोन १", required: true },
        { ...PHONE, key: "phone2", label: "Contact Number 2 / फोन २" },
        { ...PHONE, key: "whatsapp", label: "WhatsApp Business Number / व्हॉट्सॲप नंबर" },
        { key: "email", label: "Business Email / ई-मेल", type: "email" },
        { key: "website", label: "Website / Social Media URL", type: "url" },
      ],
    },
    {
      title: "Location & Government Compliance / पत्ता व परवाना",
      fields: [
        { key: "shop_address", label: "Shop / Office No. & Commercial Complex / दुकान क्र. व कॉम्प्लेक्स", type: "text", required: true, translit: true },
        { key: "landmark", label: "Landmark / मुख्य खूण", type: "text", translit: true },
        pin({ city_district: "district" }),
        { key: "city_district", label: "City / District / शहर/जिल्हा", type: "text", required: true, translit: true },
        { key: "udyam_no", label: "MSME Udyam Registration No. / उद्यम नोंदणी क्र.", type: "text" },
        { key: "shop_act_no", label: "Shop Act License No. / गुमास्ता परवाना क्र.", type: "text" },
        { key: "gst", label: "GST Number / जी.एस.टी. क्रमांक", type: "gst" },
        { key: "bis", label: "BIS Hallmarking Certified? / हॉलमार्क परवाना आहे का?", type: "select", options: C.BIS },
      ],
    },
  ],
  consent: "I certify that this enterprise complies with Sonar Community business regulations. / हा व्यवसाय सोनार समाजाच्या व्यवसाय नियमांचे पालन करतो याची मी खात्री देतो.",
  saveLabel: "Save / सेव्ह करा",
  validate: (v): Record<string, string> =>
    !String(v.udyam_no || "").trim() && !String(v.shop_act_no || "").trim()
      ? { udyam_no: "Udyam or Shop Act number is mandatory / उद्यम किंवा गुमास्ता क्रमांक आवश्यक" }
      : {},
  subtitle: (d) => [C.englishPart(d.category_business), d.city_district].filter(Boolean).join(" · "),
};

// ------------------------------------------------------------------ Social worker
const socialWorker: FormDef = {
  type: "social_worker",
  title: "समाजसेवक नोंदणी अर्ज / Social Worker Registration",
  dirTitle: "Social Workers / समाजसेवक",
  titleKey: "full_name",
  subCasteKey: "sub_caste",
  photos: [{ key: "photo", label: "Profile Photograph / प्रोफाइल फोटो", shape: "circle", required: true }],
  defaults: {},
  sections: [
    {
      title: "Personal Profile / वैयक्तिक माहिती",
      fields: [
        { key: "full_name", label: "Full Name / समाजसेवकाचे पूर्ण नाव", type: "name", required: true, translit: true },
        { key: "sub_caste", label: "Sub-Caste / उपजात", type: "select", required: true, options: C.SUB_CASTES },
        { key: "dob", label: "Date of Birth / जन्म तारीख", type: "date", required: true },
        { key: "blood_group", label: "Blood Group / रक्त गट", type: "select", required: true, options: C.BLOOD_GROUPS },
      ],
    },
    {
      title: "Contact & Area of Operations / कार्यक्षेत्र व संपर्क",
      fields: [
        { ...PHONE, key: "phone", label: "Primary Phone / मोबाईल क्र.", required: true },
        { ...PHONE, key: "whatsapp", label: "WhatsApp Helpline Number / व्हॉट्सॲप नंबर", required: true },
        { key: "email", label: "Email / ई-मेल", type: "email" },
        { key: "address", label: "Current Residential Address / पत्ता", type: "text", required: true, translit: true },
        pin({ operating_area: "taluka_district" }),
        { key: "operating_area", label: "Operating Taluka & District / कार्यक्षेत्र (तालुका व जिल्हा)", type: "text", required: true, translit: true },
      ],
    },
    {
      title: "Experience & Contributions / सामाजिक कार्य व अनुभव",
      fields: [
        { key: "years", label: "Years of Social Service / समाजसेवेतील अनुभव", type: "select", required: true, options: C.SERVICE_YEARS },
        { key: "specialization", label: "Core Specialization / कार्याचे मुख्य क्षेत्र", type: "select", required: true, options: C.SPECIALIZATIONS },
        { key: "ngo_name", label: "Registered NGO / Sanstha Name / संस्थेचे नाव (असल्यास)", type: "text", translit: true },
        { key: "ngo_designation", label: "Designation in Sanstha / पद", type: "text" },
        { key: "narrative", label: "Brief Narrative of Contributions / सामाजिक कार्याची थोडक्यात माहिती", type: "textarea", required: true, maxLength: 1000, placeholder: "गेल्या काही वर्षांत केलेल्या प्रमुख सामाजिक कार्यांची माहिती द्या..." },
      ],
    },
    {
      title: "References & Consent / संदर्भ",
      fields: [
        { key: "reference1", label: "Reference 1 (Name & Contact) / संदर्भ १ (नाव व मोबाईल)", type: "text", required: true, translit: true },
        { key: "reference2", label: "Reference 2 (Name & Contact) / संदर्भ २ (नाव व मोबाईल)", type: "text", translit: true },
      ],
    },
  ],
  consent: "I confirm adherence to all 12 social work guidelines without political agenda. / मी कोणत्याही राजकीय हेतूशिवाय सर्व १२ समाजसेवा नियमांचे पालन करीन.",
  saveLabel: "Save / सेव्ह करा",
  subtitle: (d) => [C.englishPart(d.specialization), d.operating_area].filter(Boolean).join(" · "),
};

export const FORMS: Record<string, FormDef> = { member, matrimony, business, social_worker: socialWorker };

// ------------------------------------------------------------------ validation
const RX = {
  phone: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  pincode: /^\d{6}$/,
  name: /^[A-Za-z\u0900-\u097F\s.'-]+$/,
  time: /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/,
  gst: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  url: /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i,
  number: /^\d{1,3}$/,
};

const isEmpty = (v: any) => v === undefined || v === null || (typeof v === "string" && !v.trim());

export function fieldError(f: Field, v: any): string | null {
  if (isEmpty(v)) return null;
  const s = String(v).trim();
  switch (f.type) {
    case "phone": return RX.phone.test(s) ? null : "Enter 10 digits starting 6-9 / १० अंकी मोबाईल";
    case "email": return RX.email.test(s) ? null : "Enter a valid email / योग्य ई-मेल";
    case "pincode": return RX.pincode.test(s) ? null : "Enter 6-digit PIN / ६ अंकी पिनकोड";
    case "name": return RX.name.test(s) ? null : "Letters only / फक्त अक्षरे";
    case "time": return RX.time.test(s) ? null : "Use HH:MM and AM/PM";
    case "gst": return RX.gst.test(s.toUpperCase()) ? null : "Enter valid 15-character GSTIN";
    case "url": return RX.url.test(s) ? null : "Enter a valid URL";
    case "number": return RX.number.test(s) ? null : "Numbers only";
    case "year": {
      const y = Number(s);
      return /^\d{4}$/.test(s) && y >= 1800 && y <= new Date().getFullYear() ? null : "Enter a valid year (YYYY)";
    }
    case "date": {
      const d = parseDMY(s);
      if (!d) return "Use DD/MM/YYYY";
      return d > new Date() ? "Date cannot be in the future" : null;
    }
    case "textarea": return f.maxLength && s.length > f.maxLength ? `Max ${f.maxLength} characters` : null;
    default: return null;
  }
}

export function validateForm(def: FormDef, values: Record<string, any>, photos: Record<string, PhotoVal>) {
  const errors: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of def.photos) if (p.required && !photos[p.key]) missing.push(p.label.split(" / ")[0]);
  for (const sec of def.sections) {
    for (const f of sec.fields) {
      if (f.showIf && !f.showIf(values)) continue;
      if (f.type === "copy") continue;
      if (f.type === "repeater") {
        (values[f.key] || []).forEach((row: any, i: number) => {
          for (const sf of f.fields || []) {
            const e = fieldError(sf, row[sf.key]);
            if (e) errors[`${f.key}.${i}.${sf.key}`] = e;
          }
        });
        continue;
      }
      const v = values[f.key];
      if (f.required && isEmpty(v)) missing.push(f.label.split(" / ")[0]);
      const e = fieldError(f, v);
      if (e) errors[f.key] = e;
    }
  }
  for (const [k, msg] of Object.entries(def.validate?.(values) ?? {})) if (!errors[k]) errors[k] = msg;
  return { errors, missing };
}

export function convertValues(def: FormDef, values: Record<string, any>) {
  const next = { ...values };
  for (const sec of def.sections) {
    for (const f of sec.fields) {
      if (f.type === "repeater") {
        next[f.key] = (values[f.key] || []).map((row: any) => {
          const r = { ...row };
          for (const sf of f.fields || []) if (sf.translit && typeof r[sf.key] === "string") r[sf.key] = transliterate(r[sf.key]);
          return r;
        });
      } else if (f.translit && typeof values[f.key] === "string") {
        next[f.key] = transliterate(values[f.key]);
      }
    }
  }
  return next;
}
