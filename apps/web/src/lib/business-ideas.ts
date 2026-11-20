import type { Locale } from './i18n/messages';

export const BUSINESS_TYPES = [
  'shop',
  'restaurant',
  'school',
  'health',
  'jobs',
  'realestate',
  'services',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

interface Idea {
  /** Short name shown on the button. */
  title: string;
  /** Starting text. The [brackets] are blanks the person fills in with their own details. */
  text: string;
}

type Table = Record<BusinessType, { label: string; ideas: Idea[] }>;

const EN: Table = {
  shop: {
    label: 'Shop',
    ideas: [
      {
        title: 'New product',
        text: 'We now sell [product name] at [shop name]. It is [what it is or does]. Price: [price]. Available from [date] at [place or website].',
      },
      {
        title: 'Promotion',
        text: '[Shop name] has a special offer: [offer, for example 20% off on product]. It starts on [start date] and ends on [end date]. Visit us at [place or website].',
      },
      {
        title: 'Opening',
        text: '[Shop name] is opening a new shop at [address] on [date]. Opening hours: [hours]. [Gift or welcome offer for the first customers].',
      },
    ],
  },
  restaurant: {
    label: 'Restaurant or café',
    ideas: [
      {
        title: 'New dish',
        text: '[Restaurant name] introduces a new dish: [dish name], made with [main ingredients]. Price: [price]. Available from [date].',
      },
      {
        title: 'Special event',
        text: '[Restaurant name] hosts [event, for example live music night] on [date] at [time]. Reservations: [phone or website].',
      },
      {
        title: 'Opening hours',
        text: '[Restaurant name] is open [days] from [opening time] to [closing time] at [address]. Book a table: [phone or website].',
      },
    ],
  },
  school: {
    label: 'School or training',
    ideas: [
      {
        title: 'Registration open',
        text: '[School name] is now enrolling students for [course or level], starting on [start date]. Registration closes on [date]. Contact: [phone or website].',
      },
      {
        title: 'New course',
        text: '[School name] launches a new course: [course name]. It lasts [duration], on [days and times]. It is for [who it is for]. Price: [price].',
      },
      {
        title: 'Open day',
        text: '[School name] invites families to an open day on [date] from [start time] to [end time] at [address]. Free entry.',
      },
    ],
  },
  health: {
    label: 'Clinic or wellness',
    ideas: [
      {
        title: 'New service',
        text: '[Clinic name] now offers [service]. Appointments are available [days and hours] at [address]. Book: [phone or website].',
      },
      {
        title: 'Health tip',
        text: '[Clinic name] reminds you: [one clear health tip]. For advice, contact us at [phone or website].',
      },
      {
        title: 'Awareness day',
        text: '[Clinic name] offers free [check-up or screening] on [date] from [start time] to [end time] at [address].',
      },
    ],
  },
  jobs: {
    label: 'Recruitment',
    ideas: [
      {
        title: 'Job offer',
        text: '[Company name] is hiring a [job title] in [city]. Main tasks: [tasks]. Requirements: [requirements]. Contract: [type]. Apply before [date] at [email or website].',
      },
      {
        title: 'Hiring event',
        text: '[Company name] organises a recruitment day on [date] at [address]. We are looking for [profiles]. Bring your CV.',
      },
      {
        title: 'Internship',
        text: '[Company name] offers an internship in [field] for [duration], starting [date]. Apply at [email or website] before [date].',
      },
    ],
  },
  realestate: {
    label: 'Real estate',
    ideas: [
      {
        title: 'Property for sale',
        text: '[Type of property] for sale in [neighbourhood, city]: [surface] m², [number] bedrooms. Price: [price]. Contact [agency name] at [phone].',
      },
      {
        title: 'Property for rent',
        text: '[Type of property] for rent in [neighbourhood, city]: [surface] m², [number] bedrooms. Rent: [price] per month. Contact [agency name] at [phone].',
      },
      {
        title: 'Visit day',
        text: '[Agency name] invites you to visit [property or project] on [date] from [start time] to [end time] at [address].',
      },
    ],
  },
  services: {
    label: 'Services or agency',
    ideas: [
      {
        title: 'New service',
        text: '[Business name] now offers [service]. It helps [who] to [result]. Price from [price]. Contact: [phone or website].',
      },
      {
        title: 'Special offer',
        text: '[Business name] offers [offer] until [date]. It includes [what is included]. Contact: [phone or website].',
      },
      {
        title: 'Success story',
        text: '[Business name] helped [client or type of client] to [result]. We did this by [what you did]. Contact us at [phone or website].',
      },
    ],
  },
};

const FR: Table = {
  shop: {
    label: 'Boutique',
    ideas: [
      {
        title: 'Nouveau produit',
        text: '[Nom de la boutique] vend désormais [nom du produit]. C’est [ce que c’est ou ce que ça fait]. Prix : [prix]. Disponible dès le [date] à [lieu ou site web].',
      },
      {
        title: 'Promotion',
        text: '[Nom de la boutique] propose une offre spéciale : [offre, par exemple 20 % sur un produit]. Du [date de début] au [date de fin]. Rendez-vous à [lieu ou site web].',
      },
      {
        title: 'Ouverture',
        text: '[Nom de la boutique] ouvre un nouveau magasin à [adresse] le [date]. Horaires : [horaires]. [Cadeau ou offre de bienvenue pour les premiers clients].',
      },
    ],
  },
  restaurant: {
    label: 'Restaurant ou café',
    ideas: [
      {
        title: 'Nouveau plat',
        text: '[Nom du restaurant] présente un nouveau plat : [nom du plat], préparé avec [ingrédients principaux]. Prix : [prix]. Disponible dès le [date].',
      },
      {
        title: 'Événement',
        text: '[Nom du restaurant] organise [événement, par exemple une soirée musicale] le [date] à [heure]. Réservations : [téléphone ou site web].',
      },
      {
        title: 'Horaires',
        text: '[Nom du restaurant] est ouvert [jours] de [heure d’ouverture] à [heure de fermeture] à [adresse]. Réservez : [téléphone ou site web].',
      },
    ],
  },
  school: {
    label: 'École ou formation',
    ideas: [
      {
        title: 'Inscriptions ouvertes',
        text: '[Nom de l’école] ouvre les inscriptions pour [cours ou niveau], début le [date de début]. Clôture des inscriptions le [date]. Contact : [téléphone ou site web].',
      },
      {
        title: 'Nouveau cours',
        text: '[Nom de l’école] lance un nouveau cours : [nom du cours]. Durée : [durée], [jours et horaires]. Pour [public concerné]. Prix : [prix].',
      },
      {
        title: 'Portes ouvertes',
        text: '[Nom de l’école] invite les familles à une journée portes ouvertes le [date] de [heure de début] à [heure de fin] à [adresse]. Entrée libre.',
      },
    ],
  },
  health: {
    label: 'Clinique ou bien-être',
    ideas: [
      {
        title: 'Nouveau service',
        text: '[Nom de la clinique] propose désormais [service]. Rendez-vous [jours et horaires] à [adresse]. Réservez : [téléphone ou site web].',
      },
      {
        title: 'Conseil santé',
        text: '[Nom de la clinique] vous rappelle : [un conseil santé clair]. Pour plus d’informations, contactez-nous : [téléphone ou site web].',
      },
      {
        title: 'Journée de sensibilisation',
        text: '[Nom de la clinique] offre un [bilan ou dépistage] gratuit le [date] de [heure de début] à [heure de fin] à [adresse].',
      },
    ],
  },
  jobs: {
    label: 'Recrutement',
    ideas: [
      {
        title: 'Offre d’emploi',
        text: '[Nom de l’entreprise] recrute un [intitulé du poste] à [ville]. Missions : [missions]. Profil : [exigences]. Contrat : [type]. Candidature avant le [date] à [email ou site web].',
      },
      {
        title: 'Journée de recrutement',
        text: '[Nom de l’entreprise] organise une journée de recrutement le [date] à [adresse]. Nous recherchons [profils]. Apportez votre CV.',
      },
      {
        title: 'Stage',
        text: '[Nom de l’entreprise] propose un stage en [domaine] de [durée], dès le [date]. Candidatez à [email ou site web] avant le [date].',
      },
    ],
  },
  realestate: {
    label: 'Immobilier',
    ideas: [
      {
        title: 'Bien à vendre',
        text: '[Type de bien] à vendre à [quartier, ville] : [surface] m², [nombre] chambres. Prix : [prix]. Contact : [nom de l’agence] au [téléphone].',
      },
      {
        title: 'Bien à louer',
        text: '[Type de bien] à louer à [quartier, ville] : [surface] m², [nombre] chambres. Loyer : [prix] par mois. Contact : [nom de l’agence] au [téléphone].',
      },
      {
        title: 'Journée de visite',
        text: '[Nom de l’agence] vous invite à visiter [bien ou projet] le [date] de [heure de début] à [heure de fin] à [adresse].',
      },
    ],
  },
  services: {
    label: 'Services ou agence',
    ideas: [
      {
        title: 'Nouveau service',
        text: '[Nom de l’entreprise] propose désormais [service]. Il aide [qui] à [résultat]. À partir de [prix]. Contact : [téléphone ou site web].',
      },
      {
        title: 'Offre spéciale',
        text: '[Nom de l’entreprise] propose [offre] jusqu’au [date]. Elle comprend [ce qui est inclus]. Contact : [téléphone ou site web].',
      },
      {
        title: 'Cas client',
        text: '[Nom de l’entreprise] a aidé [client ou type de client] à [résultat]. Nous avons [ce que vous avez fait]. Contactez-nous : [téléphone ou site web].',
      },
    ],
  },
};

const AR: Table = {
  shop: {
    label: 'متجر',
    ideas: [
      {
        title: 'منتج جديد',
        text: 'يعرض [اسم المتجر] الآن [اسم المنتج]. وهو [وصف المنتج أو فائدته]. السعر: [السعر]. متوفر ابتداءً من [التاريخ] في [المكان أو الموقع].',
      },
      {
        title: 'عرض خاص',
        text: 'يقدم [اسم المتجر] عرضًا خاصًا: [العرض، مثل تخفيض 20% على منتج]. يبدأ في [تاريخ البداية] وينتهي في [تاريخ النهاية]. زورونا في [المكان أو الموقع].',
      },
      {
        title: 'افتتاح',
        text: 'يفتتح [اسم المتجر] فرعًا جديدًا في [العنوان] يوم [التاريخ]. ساعات العمل: [الساعات]. [هدية أو عرض ترحيبي لأوائل الزبائن].',
      },
    ],
  },
  restaurant: {
    label: 'مطعم أو مقهى',
    ideas: [
      {
        title: 'طبق جديد',
        text: 'يقدم [اسم المطعم] طبقًا جديدًا: [اسم الطبق] المحضّر من [المكونات الرئيسية]. السعر: [السعر]. متوفر ابتداءً من [التاريخ].',
      },
      {
        title: 'حدث خاص',
        text: 'ينظم [اسم المطعم] [الحدث، مثل أمسية موسيقية] يوم [التاريخ] على الساعة [الوقت]. للحجز: [الهاتف أو الموقع].',
      },
      {
        title: 'ساعات العمل',
        text: 'يفتح [اسم المطعم] أبوابه [الأيام] من [وقت الفتح] إلى [وقت الإغلاق] في [العنوان]. احجز طاولتك: [الهاتف أو الموقع].',
      },
    ],
  },
  school: {
    label: 'مدرسة أو تكوين',
    ideas: [
      {
        title: 'فتح التسجيل',
        text: 'يفتح [اسم المدرسة] باب التسجيل في [الدورة أو المستوى]، ويبدأ الدرس يوم [تاريخ البداية]. آخر أجل للتسجيل: [التاريخ]. للتواصل: [الهاتف أو الموقع].',
      },
      {
        title: 'دورة جديدة',
        text: 'يطلق [اسم المدرسة] دورة جديدة: [اسم الدورة]. مدتها [المدة]، في [الأيام والأوقات]. موجهة إلى [الفئة المستهدفة]. السعر: [السعر].',
      },
      {
        title: 'يوم مفتوح',
        text: 'يدعو [اسم المدرسة] العائلات إلى يوم مفتوح يوم [التاريخ] من [وقت البداية] إلى [وقت النهاية] في [العنوان]. الدخول مجاني.',
      },
    ],
  },
  health: {
    label: 'عيادة أو عناية',
    ideas: [
      {
        title: 'خدمة جديدة',
        text: 'تقدم [اسم العيادة] الآن [الخدمة]. المواعيد متاحة [الأيام والساعات] في [العنوان]. للحجز: [الهاتف أو الموقع].',
      },
      {
        title: 'نصيحة صحية',
        text: 'تذكّركم [اسم العيادة]: [نصيحة صحية واضحة]. للمزيد من المعلومات تواصلوا معنا: [الهاتف أو الموقع].',
      },
      {
        title: 'يوم توعوي',
        text: 'تقدم [اسم العيادة] [فحصًا أو كشفًا] مجانيًا يوم [التاريخ] من [وقت البداية] إلى [وقت النهاية] في [العنوان].',
      },
    ],
  },
  jobs: {
    label: 'توظيف',
    ideas: [
      {
        title: 'عرض عمل',
        text: 'تبحث [اسم الشركة] عن [المسمى الوظيفي] في [المدينة]. المهام: [المهام]. المتطلبات: [المتطلبات]. نوع العقد: [النوع]. التقديم قبل [التاريخ] عبر [البريد أو الموقع].',
      },
      {
        title: 'يوم توظيف',
        text: 'تنظم [اسم الشركة] يوم توظيف بتاريخ [التاريخ] في [العنوان]. نبحث عن [الملفات المطلوبة]. أحضروا سيرتكم الذاتية.',
      },
      {
        title: 'تدريب',
        text: 'تعرض [اسم الشركة] تدريبًا في [المجال] لمدة [المدة] ابتداءً من [التاريخ]. للتقديم عبر [البريد أو الموقع] قبل [التاريخ].',
      },
    ],
  },
  realestate: {
    label: 'عقارات',
    ideas: [
      {
        title: 'عقار للبيع',
        text: '[نوع العقار] للبيع في [الحي، المدينة]: [المساحة] م²، [عدد] غرف نوم. السعر: [السعر]. للتواصل: [اسم الوكالة] على [الهاتف].',
      },
      {
        title: 'عقار للكراء',
        text: '[نوع العقار] للكراء في [الحي، المدينة]: [المساحة] م²، [عدد] غرف نوم. الإيجار: [السعر] شهريًا. للتواصل: [اسم الوكالة] على [الهاتف].',
      },
      {
        title: 'يوم زيارة',
        text: 'تدعوكم [اسم الوكالة] لزيارة [العقار أو المشروع] يوم [التاريخ] من [وقت البداية] إلى [وقت النهاية] في [العنوان].',
      },
    ],
  },
  services: {
    label: 'خدمات أو وكالة',
    ideas: [
      {
        title: 'خدمة جديدة',
        text: 'تقدم [اسم الشركة] الآن [الخدمة]. تساعد [الفئة] على [النتيجة]. ابتداءً من [السعر]. للتواصل: [الهاتف أو الموقع].',
      },
      {
        title: 'عرض خاص',
        text: 'تقدم [اسم الشركة] [العرض] حتى [التاريخ]. يشمل [ما يتضمنه العرض]. للتواصل: [الهاتف أو الموقع].',
      },
      {
        title: 'قصة نجاح',
        text: 'ساعدت [اسم الشركة] [العميل أو نوع العميل] على [النتيجة]. قمنا بـ [ما فعلتموه]. تواصلوا معنا: [الهاتف أو الموقع].',
      },
    ],
  },
};

const TABLES: Record<Locale, Table> = { en: EN, fr: FR, ar: AR };

export const businessTable = (locale: Locale): Table => TABLES[locale] ?? EN;

/** True while the text still has blanks like [price] or [السعر] left to fill in. */
export const hasBlanks = (text: string): boolean => /\[[^\]\n]{1,60}\]/.test(text);
