export interface LegalSection {
  heading?: string;
  body: string;
}

export interface LegalDocument {
  title: string;
  introduction?: string;
  sections: LegalSection[];
}

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  sections: [
    {
      heading: "Overview",
      body: "This policy explains what information MARSA collects, how we use it, who we share it with, and the choices you have. It applies to the MARSA mobile app and our website.",
    },
    {
      heading: "1. Information We Collect",
      body: "Account details you provide (name, email, phone number). If you list a yacht or experience as an owner, the identity and verification documents we need to confirm you can transact. The listings, bookings, reviews, and messages you create. Approximate or precise location to show nearby listings and power map search. Device and usage data — including device identifiers and app activity — needed to keep the app reliable.",
    },
    {
      heading: "2. How We Use Your Information",
      body: "To operate MARSA — sign you in, process bookings, show relevant listings, send booking and support messages, verify owners, and improve the service. We never sell your personal data.",
    },
    {
      heading: "3. Sharing and Third Parties",
      body: "We share data only with providers that run the service: maps, cloud hosting, and analytics. We also share advertising and conversion events with Meta (Facebook and Instagram) to measure and improve our marketing. Each provider acts under contract. We may also disclose information to comply with the law or a valid legal request, and — if MARSA is ever part of a merger, acquisition, or sale of assets — as part of that transaction.",
    },
    {
      heading: "4. Where We Store Your Data",
      body: "Your data is stored and processed on secure cloud infrastructure hosted in Europe, which may be outside the country where you use MARSA. Wherever it is processed, we apply the protections described in this policy.",
    },
    {
      heading: "5. How Long We Keep It",
      body: "We keep your data while your account is active. Some records — notably booking and transaction records — are kept after deletion for the period required by applicable tax, accounting, and dispute-resolution law.",
    },
    {
      heading: "6. How We Protect Your Data",
      body: "We use encryption in transit, access controls, and reputable cloud providers to protect your information, and we limit access to those who need it to run the service. No system is perfectly secure, but we work to keep your data safe.",
    },
    {
      heading: "7. Your Rights and Choices",
      body: "You can edit your profile, manage notifications, and request account deletion by emailing us at privacy@marsa.app. You may also request a copy of your data or ask us to correct it.",
    },
    {
      heading: "8. Children",
      body: "MARSA is intended for adults. It is not directed at children, and you must be at least 18 years old (or the age of majority where you live) to create an account.",
    },
    {
      heading: "9. Changes to This Policy",
      body: "We may update this policy from time to time. Where changes are material, we will notify you in the app.",
    },
    {
      heading: "10. Contact Us",
      body: "Questions or requests about your data? Email privacy@marsa.app and we will respond.",
    },
  ],
};

export const termsOfUse: LegalDocument = {
  title: "Terms of Use",
  introduction:
    "These terms govern your use of the MARSA app and services. By creating an account or using MARSA, you agree to them.",
  sections: [
    {
      heading: "1. Accounts",
      body: "You must be 18+ to book or list. You are responsible for keeping your login secure and for actions taken with your account.",
    },
    {
      heading: "2. Listings and Bookings",
      body: "Owners are responsible for accurate listings, safety, and honoring confirmed bookings. Customers agree to the cancellation policy shown at booking time.",
    },
    {
      heading: "3. Payments",
      body: "Payment for a booking is arranged directly between you and the owner — MARSA is a platform that connects you and is not a party to that payment. The cancellation terms shown on each listing apply.",
    },
    {
      heading: "4. Content and Conduct",
      body: "You agree not to upload unlawful content, harass other users, or try to game the review system. MARSA may suspend accounts that violate these rules.",
    },
    {
      heading: "5. Changes",
      body: "We may update these terms; material changes will be announced in-app.",
    },
  ],
};

export const legalDocuments = {
  privacy: privacyPolicy,
  terms: termsOfUse,
} as const;

export type LegalDocumentKey = keyof typeof legalDocuments;
