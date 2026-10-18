/**
 * Normal values, for the lab values panel in a session (2026-10-18).
 *
 * From the reference list Rafil supplied, in its order. Three entries were
 * corrected on the way in: fibrinogen was 15–40 g/L (it is 1.5–4.0), the CD4
 * unit was "μ/L" (cells/μL), and "USerum osmolality" was a typo. Ranges vary
 * between labs and populations; these are the standard UK teaching values.
 *
 * A value is a string, or an array of strings for one shown on two lines
 * (male and female, usually).
 */
export const LAB_TABS = [
  {
    id: "haem",
    label: "Haem",
    sections: [
      {
        title: "Haematology",
        rows: [
          ["Haemoglobin", ["(M) 130 – 170 g/L", "(F) 115 – 155 g/L"]],
          ["White cell count", "3.0 – 10.0 × 10⁹/L"],
          ["Platelets", "150 – 400 × 10⁹/L"],
          ["Mean cell haemoglobin (MCH)", "27 – 33 pg"],
          ["Mean cell haemoglobin concentration (MCHC)", "320 – 350 g/L"],
          ["Mean cell volume (MCV)", "80 – 96 fL"],
          ["Neutrophils", "2.0 – 7.5 × 10⁹/L"],
          ["Lymphocytes", "1.5 – 4.0 × 10⁹/L"],
          ["Monocytes", "0.2 – 1.0 × 10⁹/L"],
          ["Eosinophils", "0 – 0.4 × 10⁹/L"],
          ["Basophils", "0 – 0.1 × 10⁹/L"],
          ["Reticulocytes", "25 – 100 × 10⁹/L"],
          ["Packed cell volume (PCV)", ["(M) 0.40 – 0.54", "(F) 0.37 – 0.50"]],
          ["Erythrocyte sedimentation rate (ESR)", "< 20 mm/hr"],
          ["D-dimers", "< 0.5 mg/L"],
        ],
      },
      {
        title: "Coagulation screen",
        rows: [
          ["International normalised ratio (INR)", "1.0"],
          ["Activated partial thromboplastin time (APTT)", "22 – 41 seconds"],
          ["Prothrombin time (PT)", "10 – 12 seconds"],
          ["Thrombin time (TT)", "9 – 15 seconds"],
          ["Fibrinogen", "1.5 – 4.0 g/L"],
          ["Fibrinogen degradation products", "< 8 mg/mL"],
          ["Factor VIII:C", "50 – 150 U/dL"],
          ["Bleeding time", "< 10 minutes"],
        ],
      },
      {
        title: "Arterial blood gas",
        rows: [
          ["pH", "7.35 – 7.45"],
          ["PaO₂", "11 – 15 kPa"],
          ["PaCO₂", "4.6 – 6.4 kPa"],
          ["Bicarbonate", "22 – 30 mmol/L"],
          ["Base excess", "−2 to +2 mmol/L"],
        ],
      },
    ],
  },
  {
    id: "chem",
    label: "Chem",
    sections: [
      {
        title: "Electrolytes",
        rows: [
          ["Sodium", "135 – 145 mmol/L"],
          ["Potassium", "3.5 – 5.3 mmol/L"],
          ["Chloride", "95 – 106 mmol/L"],
          ["Bicarbonate", "22 – 29 mmol/L"],
          ["Urea", "2.5 – 7.8 mmol/L"],
          ["Creatinine", "60 – 120 µmol/L"],
          ["Calcium", "2.2 – 2.6 mmol/L"],
          ["Magnesium", "0.7 – 1.0 mmol/L"],
          ["Phosphate", "0.8 – 1.5 mmol/L"],
          ["eGFR", "> 60 mL/min/1.73m²"],
        ],
      },
      {
        title: "Metabolic tests",
        rows: [
          ["Fasting glucose", "3.5 – 5.5 mmol/L"],
          ["Glycated haemoglobin", ["20 – 42 mmol/mol", "or 4 – 6%"]],
          ["Total cholesterol", "< 5.0 mmol/L"],
          ["Triglycerides (fasting)", "< 2.3 mmol/L"],
          ["Serum osmolality", "285 – 295 mOsmol/kg"],
        ],
      },
      {
        title: "Liver function",
        rows: [
          ["Albumin", "35 – 50 g/L"],
          ["Alanine aminotransferase (ALT)", "10 – 50 IU/L"],
          ["Aspartate aminotransferase (AST)", "10 – 40 IU/L"],
          ["Alkaline phosphatase (ALP)", "25 – 115 IU/L"],
          ["Bilirubin", "< 17 µmol/L"],
          ["Gamma glutamyl transferase (GGT)", "9 – 40 U/L"],
        ],
      },
      {
        title: "Cardiac enzymes",
        rows: [
          ["Creatine kinase", ["(M) 25 – 200 U/L", "(F) 25 – 175 U/L"]],
          ["Troponin T", "< 14 ng/L"],
        ],
      },
      {
        title: "Haematinics",
        rows: [
          ["Serum vitamin B12", "160 – 925 ng/L"],
          ["Serum folate", "3 – 15 µg/L"],
          ["Ferritin", "12 – 200 µg/L"],
          ["Iron", ["(M) 14 – 31 µmol/L", "(F) 11 – 30 µmol/L"]],
          ["Total iron binding capacity", "54 – 75 µmol/L"],
        ],
      },
      {
        title: "Endocrinology",
        rows: [
          ["Thyroid stimulating hormone", "0.3 – 4.2 mU/L"],
          ["Total T4", "60 – 150 nmol/L"],
          ["Free T4", "9 – 25 pmol/L"],
          ["Cortisol (9am)", "200 – 700 nmol/L"],
          ["Parathyroid hormone", "1.6 – 8.5 pmol/L"],
          ["Vitamin D", "> 50 nmol/L"],
          ["Prolactin", ["(M) 90 – 320 IU/L", "(F) 100 – 500 IU/L"]],
          ["Luteinising hormone", "1 – 11 IU/L (luteal)"],
          ["Follicle stimulating hormone", "2 – 8 IU/L (luteal)"],
          ["Renin", "1.2 – 4.5 pmol/mL/hr"],
          ["Aldosterone", "600 – 1200 pmol/L"],
          ["Testosterone", ["(M) 9.9 – 27.8 nmol/L", "(F) 0.2 – 2.9 nmol/L"]],
        ],
      },
    ],
  },
  {
    id: "misc",
    label: "Misc",
    sections: [
      {
        title: "Miscellaneous",
        rows: [
          ["FVC", "> 80%"],
          ["FEV1", "> 80%"],
          ["Amylase", "< 220 U/L"],
          ["Prostate specific antigen (PSA)", "< 4 µg/L"],
          ["C reactive protein", "< 5 mg/L"],
          ["Carboxyhaemoglobin", "< 1.5%"],
          ["CD4 count", "430 – 1690 cells/µL"],
          ["Urate", ["(M) 0.2 – 0.42 mmol/L", "(F) 0.14 – 0.34 mmol/L"]],
          ["Total protein", "60 – 80 g/L"],
          ["IgG", "5.5 – 16.5 g/L"],
          ["IgA", "0.8 – 4 g/L"],
          ["IgM", "0.5 – 3 g/L"],
          ["Complement C3", "0.75 – 1.65 g/L"],
          ["Complement C4", "0.14 – 0.54 g/L"],
          ["Urinary sodium (24hr)", "75 – 300 mmol/24hrs"],
          ["Urinary potassium", "40 – 100 mmol/24hrs"],
          ["Plasma osmolality", "275 – 299 mOsmol/kg"],
        ],
      },
      {
        title: "Tumour markers",
        rows: [
          ["Lactate dehydrogenase", "70 – 250 IU/L"],
          ["Alpha-fetoprotein", "< 10 U/mL"],
          ["CA125", "< 35 U/mL"],
          ["CA 15-3", "< 25 U/mL"],
          ["CA 19-9", "< 34 U/mL"],
          ["Carcinoembryonic antigen (CEA)", "< 5 µg/L"],
        ],
      },
      {
        title: "Cerebrospinal fluid",
        rows: [
          ["Opening pressure", "50 – 180 mmH₂O"],
          ["Total protein", "0.15 – 0.45 g/L"],
          ["Glucose", "3.2 – 4.4 mmol/L"],
          ["Cell count", "< 5/µL"],
          ["Lymphocyte count", "60 – 70%"],
          ["Lactate", "< 2 mmol/L"],
        ],
      },
      {
        title: "Peritoneal fluid",
        rows: [
          ["RBC", "None"],
          ["WBC", "< 250/mm³"],
          ["Albumin", "< 40 g/L"],
          ["Glucose", "3.5 – 5.5 mmol/L"],
        ],
      },
    ],
  },
];
