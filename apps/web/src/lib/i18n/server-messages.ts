// The API's error messages are written in English. These are their French and Arabic versions, looked up by
// the exact English text, so the server stays language-neutral and unknown messages simply stay in English.
// A test in the API (src/server-messages.spec.ts) fails when a new server message is added without a translation.
import type { Locale } from './messages';

type Entry = readonly [en: string, fr: string, ar: string];

const ENTRIES: readonly Entry[] = [
  // ---- AI
  [
    'Too many AI requests. Please wait a moment.',
    'Trop de requêtes d’IA. Patientez un instant.',
    'طلبات ذكاء اصطناعي كثيرة. انتظر قليلًا.',
  ],
  ['A prompt is required', 'Une description est requise', 'الوصف مطلوب'],
  ['Prompt is too long', 'La description est trop longue', 'الوصف طويل جدًا'],
  [
    'Prompt must be 1 to 2048 characters',
    'La description doit contenir de 1 à 2048 caractères',
    'يجب أن يتراوح الوصف بين 1 و2048 حرفًا',
  ],
  [
    'Steps must be 1 to 8',
    'Le nombre d’étapes doit être compris entre 1 et 8',
    'يجب أن يكون عدد الخطوات بين 1 و8',
  ],
  [
    'The AI model did not return valid structured output. Please try again.',
    'Le modèle d’IA n’a pas renvoyé de réponse structurée valide. Réessayez.',
    'لم يُرجع نموذج الذكاء الاصطناعي ناتجًا منظمًا صالحًا. حاول مجددًا.',
  ],
  [
    'AI generation failed unexpectedly.',
    'La génération par IA a échoué de façon inattendue.',
    'فشل التوليد بالذكاء الاصطناعي بشكل غير متوقع.',
  ],
  [
    'The AI returned the text without translating it. Please try again.',
    'L’IA a renvoyé le texte sans le traduire. Réessayez.',
    'أعاد الذكاء الاصطناعي النص دون ترجمته. حاول مجددًا.',
  ],
  // ---- auth, organization, members
  ['Invalid or expired token', 'Jeton invalide ou expiré', 'الرمز غير صالح أو منتهي الصلاحية'],
  ['Organization not found', 'Organisation introuvable', 'المؤسسة غير موجودة'],
  ['Insufficient permissions', 'Droits insuffisants', 'الصلاحيات غير كافية'],
  ['You cannot invite this role', 'Vous ne pouvez pas inviter ce rôle', 'لا يمكنك دعوة هذا الدور'],
  [
    'Invalid or expired invitation',
    'Invitation invalide ou expirée',
    'الدعوة غير صالحة أو منتهية الصلاحية',
  ],
  [
    'This invitation was issued to a different email',
    'Cette invitation a été envoyée à une autre adresse e-mail',
    'صدرت هذه الدعوة لبريد إلكتروني مختلف',
  ],
  ['Member not found', 'Membre introuvable', 'العضو غير موجود'],
  [
    'An organization must keep at least one owner',
    'Une organisation doit conserver au moins un propriétaire',
    'يجب أن تحتفظ المؤسسة بمالك واحد على الأقل',
  ],
  [
    'You cannot assign this role',
    'Vous ne pouvez pas attribuer ce rôle',
    'لا يمكنك تعيين هذا الدور',
  ],
  [
    'You cannot remove this member',
    'Vous ne pouvez pas retirer ce membre',
    'لا يمكنك إزالة هذا العضو',
  ],
  // ---- brand kit and media
  [
    'This organization has no brand kit yet',
    'Cette organisation n’a pas encore de charte de marque',
    'ليست لدى هذه المؤسسة هوية بصرية بعد',
  ],
  [
    'Logo must be a media asset of this organization',
    'Le logo doit être un fichier de la médiathèque de cette organisation',
    'يجب أن يكون الشعار ملفًا من وسائط هذه المؤسسة',
  ],
  [
    'Brand kit version not found',
    'Version de la charte de marque introuvable',
    'نسخة الهوية البصرية غير موجودة',
  ],
  ['A non-empty "file" is required', 'Un fichier non vide est requis', 'مطلوب ملف غير فارغ'],
  [
    'Max file size is 5 MB',
    'La taille maximale du fichier est de 5 Mo',
    'الحد الأقصى لحجم الملف 5 ميغابايت',
  ],
  [
    'Max file size is 10 MB',
    'La taille maximale du fichier est de 10 Mo',
    'الحد الأقصى لحجم الملف 10 ميغابايت',
  ],
  [
    'Only PNG, JPEG, WebP and GIF images are allowed',
    'Seules les images PNG, JPEG, WebP et GIF sont autorisées',
    'يُسمح فقط بصور PNG وJPEG وWebP وGIF',
  ],
  ['Media not found', 'Fichier introuvable', 'الملف غير موجود'],
  [
    'Image not found in your media library',
    'Image introuvable dans votre médiathèque',
    'الصورة غير موجودة في مكتبة الوسائط',
  ],
  // ---- campaigns
  [
    'The end date cannot be before the start date',
    'La date de fin ne peut pas précéder la date de début',
    'لا يمكن أن يسبق تاريخ الانتهاء تاريخ البدء',
  ],
  ['Campaign not found', 'Campagne introuvable', 'الحملة غير موجودة'],
  [
    'Archived campaigns cannot receive new content',
    'Les campagnes archivées ne peuvent pas recevoir de nouveaux contenus',
    'لا يمكن إضافة محتوى جديد إلى الحملات المؤرشفة',
  ],
  ['Some content was not found', 'Certains contenus sont introuvables', 'بعض المحتوى غير موجود'],
  [
    'That content is not in this campaign',
    'Ce contenu ne fait pas partie de cette campagne',
    'هذا المحتوى ليس ضمن هذه الحملة',
  ],
  // ---- channels and publishing
  ['Channel not found', 'Canal introuvable', 'القناة غير موجودة'],
  [
    'This channel has no login to reconnect.',
    'Ce canal n’a pas d’identifiants à reconnecter.',
    'ليس لهذه القناة بيانات دخول لإعادة الربط.',
  ],
  [
    'That login belongs to a different account than this channel. Add it as a new channel instead.',
    'Ces identifiants appartiennent à un autre compte que ce canal. Ajoutez-les plutôt comme nouveau canal.',
    'بيانات الدخول هذه تخص حسابًا مختلفًا عن هذه القناة. أضفها كقناة جديدة بدلًا من ذلك.',
  ],
  [
    'Facebook cannot be reached from here.',
    'Facebook est inaccessible depuis ici.',
    'لا يمكن الوصول إلى فيسبوك من هنا.',
  ],
  ['Facebook could not be reached.', 'Facebook est injoignable.', 'تعذّر الوصول إلى فيسبوك.'],
  [
    'Facebook did not accept that access token. It may be wrong, expired or revoked. Create a new Page access token.',
    'Facebook n’a pas accepté ce jeton d’accès. Il est peut-être incorrect, expiré ou révoqué. Créez un nouveau jeton d’accès de Page.',
    'لم يقبل فيسبوك رمز الوصول هذا. قد يكون خاطئًا أو منتهيًا أو ملغى. أنشئ رمز وصول جديدًا للصفحة.',
  ],
  [
    'This access token does not belong to that Page. Use a Page access token (not a personal user token) generated for this Page.',
    'Ce jeton d’accès n’appartient pas à cette Page. Utilisez un jeton d’accès de Page (et non un jeton d’utilisateur personnel) généré pour cette Page.',
    'رمز الوصول هذا لا يخص تلك الصفحة. استخدم رمز وصول للصفحة (وليس رمز مستخدم شخصي) تم إنشاؤه لهذه الصفحة.',
  ],
  [
    'This channel has no saved access token. Reconnect it.',
    'Ce canal n’a pas de jeton d’accès enregistré. Reconnectez-le.',
    'ليس لهذه القناة رمز وصول محفوظ. أعد ربطها.',
  ],
  [
    'Facebook is limiting how fast this Page can post. It will be retried.',
    'Facebook limite la fréquence de publication de cette Page. Une nouvelle tentative aura lieu.',
    'يحد فيسبوك من سرعة النشر على هذه الصفحة. ستتم إعادة المحاولة.',
  ],
  // ---- Instagram
  [
    'Instagram cannot be reached from here.',
    'Instagram est inaccessible depuis ici.',
    'لا يمكن الوصول إلى إنستغرام من هنا.',
  ],
  ['Instagram could not be reached.', 'Instagram est injoignable.', 'تعذّر الوصول إلى إنستغرام.'],
  [
    'Instagram did not accept that access token. It may be wrong, expired or revoked. Create a new access token.',
    'Instagram n’a pas accepté ce jeton d’accès. Il est peut-être incorrect, expiré ou révoqué. Créez un nouveau jeton d’accès.',
    'لم يقبل إنستغرام رمز الوصول هذا. قد يكون خاطئًا أو منتهيًا أو ملغى. أنشئ رمز وصول جديدًا.',
  ],
  [
    'This token cannot see that Instagram account. Check the account ID, and that the account is a business or creator account linked to your Facebook Page.',
    'Ce jeton ne voit pas ce compte Instagram. Vérifiez l’identifiant du compte, et que c’est un compte professionnel ou créateur lié à votre Page Facebook.',
    'لا يستطيع هذا الرمز رؤية حساب إنستغرام هذا. تحقق من معرّف الحساب، ومن أنه حساب تجاري أو حساب منشئ محتوى مرتبط بصفحتك على فيسبوك.',
  ],
  [
    'This access token does not belong to that Instagram account.',
    'Ce jeton d’accès n’appartient pas à ce compte Instagram.',
    'رمز الوصول هذا لا يخص حساب إنستغرام هذا.',
  ],
  [
    'Instagram needs public picture storage on the server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).',
    'Instagram nécessite un stockage public d’images sur le serveur (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY).',
    'يحتاج إنستغرام إلى تخزين عام للصور على الخادم (SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY).',
  ],
  [
    'Instagram posts need at least one picture.',
    'Les publications Instagram nécessitent au moins une image.',
    'تحتاج منشورات إنستغرام إلى صورة واحدة على الأقل.',
  ],
  [
    'Instagram accepts JPEG pictures only. Replace the PNG, WebP or GIF pictures.',
    'Instagram n’accepte que les images JPEG. Remplacez les images PNG, WebP ou GIF.',
    'يقبل إنستغرام صور JPEG فقط. استبدل صور PNG أو WebP أو GIF.',
  ],
  [
    'Instagram is still processing the pictures. It will be retried.',
    'Instagram traite encore les images. Une nouvelle tentative aura lieu.',
    'لا يزال إنستغرام يعالج الصور. ستتم إعادة المحاولة.',
  ],
  [
    'Instagram is limiting how fast this account can post. It will be retried.',
    'Instagram limite la fréquence de publication de ce compte. Une nouvelle tentative aura lieu.',
    'يحد إنستغرام من سرعة النشر على هذا الحساب. ستتم إعادة المحاولة.',
  ],
  [
    'LinkedIn cannot be reached from here.',
    'LinkedIn est inaccessible depuis ici.',
    'لا يمكن الوصول إلى لينكدإن من هنا.',
  ],
  ['LinkedIn could not be reached.', 'LinkedIn est injoignable.', 'تعذّر الوصول إلى لينكدإن.'],
  [
    'LinkedIn did not accept that access token. It may be wrong or expired (tokens last 60 days), or it was created without the "openid", "profile" and "w_member_social" permissions.',
    'LinkedIn n’a pas accepté ce jeton d’accès. Il est peut-être incorrect ou expiré (les jetons durent 60 jours), ou il a été créé sans les autorisations « openid », « profile » et « w_member_social ».',
    'لم يقبل لينكدإن رمز الوصول هذا. قد يكون خاطئًا أو منتهيًا (صلاحية الرموز 60 يومًا)، أو أُنشئ بدون الأذونات "openid" و"profile" و"w_member_social".',
  ],
  [
    'LinkedIn did not confirm the post. Check your profile, then use "Try again" if it is missing.',
    'LinkedIn n’a pas confirmé la publication. Vérifiez votre profil, puis utilisez « Réessayer » si elle est absente.',
    'لم يؤكد لينكدإن المنشور. تحقق من ملفك الشخصي، ثم استخدم "إعادة المحاولة" إذا لم يظهر.',
  ],
  [
    'LinkedIn did not return an upload address.',
    'LinkedIn n’a pas renvoyé d’adresse d’envoi.',
    'لم يُرجع لينكدإن عنوان رفع.',
  ],
  [
    'LinkedIn is limiting how fast you can post. It will be retried.',
    'LinkedIn limite la fréquence de vos publications. Une nouvelle tentative aura lieu.',
    'يحد لينكدإن من سرعة نشرك. ستتم إعادة المحاولة.',
  ],
  [
    'LinkedIn no longer supports the API version this app uses. The server setting LINKEDIN_API_VERSION needs updating.',
    'LinkedIn ne prend plus en charge la version d’API utilisée par cette application. Le paramètre serveur LINKEDIN_API_VERSION doit être mis à jour.',
    'لم يعد لينكدإن يدعم إصدار API الذي يستخدمه هذا التطبيق. يجب تحديث إعداد الخادم LINKEDIN_API_VERSION.',
  ],
  ['Content not found', 'Contenu introuvable', 'المحتوى غير موجود'],
  [
    'Only approved content can be published',
    'Seul un contenu approuvé peut être publié',
    'يمكن نشر المحتوى المعتمد فقط',
  ],
  [
    'Schedule this content in the calendar first',
    'Planifiez d’abord ce contenu dans le calendrier',
    'قم بجدولة هذا المحتوى في التقويم أولًا',
  ],
  [
    'The scheduled time has passed: reschedule it or publish now',
    'L’heure prévue est passée : replanifiez ou publiez maintenant',
    'انقضى الموعد المحدد: أعد الجدولة أو انشر الآن',
  ],
  [
    'This content does not meet the rules of the network',
    'Ce contenu ne respecte pas les règles du réseau',
    'هذا المحتوى لا يستوفي قواعد الشبكة',
  ],
  [
    'This channel cannot publish yet',
    'Ce canal ne peut pas encore publier',
    'لا يمكن لهذه القناة النشر بعد',
  ],
  ['Publish job not found', 'Publication introuvable', 'مهمة النشر غير موجودة'],
  [
    'Only waiting posts can be cancelled',
    'Seules les publications en attente peuvent être annulées',
    'يمكن إلغاء المنشورات المنتظرة فقط',
  ],
  [
    'This post just started publishing',
    'Cette publication vient de commencer à être publiée',
    'بدأ نشر هذا المنشور للتو',
  ],
  [
    'Only failed or cancelled posts can be retried',
    'Seules les publications échouées ou annulées peuvent être relancées',
    'يمكن إعادة محاولة المنشورات الفاشلة أو الملغاة فقط',
  ],
  ['The content is no longer approved', 'Le contenu n’est plus approuvé', 'لم يعد المحتوى معتمدًا'],
  [
    'The website redirected the request. Use its final address (for example with https and without a redirect).',
    'Le site a redirigé la requête. Utilisez son adresse finale (par exemple en https et sans redirection).',
    'أعاد الموقع توجيه الطلب. استخدم عنوانه النهائي (مثلًا بـ https ودون إعادة توجيه).',
  ],
  [
    'The website sent too much data',
    'Le site a envoyé trop de données',
    'أرسل الموقع بيانات أكثر من اللازم',
  ],
  [
    'Saving channel logins is not set up on the server (missing ENCRYPTION_KEY).',
    'L’enregistrement des identifiants de canal n’est pas configuré sur le serveur (ENCRYPTION_KEY manquante).',
    'حفظ بيانات دخول القنوات غير مُعدّ على الخادم (ENCRYPTION_KEY مفقود).',
  ],
  [
    'The server ENCRYPTION_KEY must be 32 bytes, base64.',
    'La ENCRYPTION_KEY du serveur doit faire 32 octets, en base64.',
    'يجب أن يكون ENCRYPTION_KEY للخادم 32 بايت بتشفير base64.',
  ],
  [
    'Use the https address of your site. The login would travel unprotected over http.',
    'Utilisez l’adresse https de votre site. Les identifiants circuleraient sans protection en http.',
    'استخدم عنوان https لموقعك. ستنتقل بيانات الدخول دون حماية عبر http.',
  ],
  [
    'That address cannot be used for a website.',
    'Cette adresse ne peut pas être utilisée pour un site web.',
    'لا يمكن استخدام هذا العنوان لموقع إلكتروني.',
  ],
  ['The site could not be reached.', 'Le site est injoignable.', 'تعذّر الوصول إلى الموقع.'],
  [
    'This address does not look like a WordPress site.',
    'Cette adresse ne ressemble pas à un site WordPress.',
    'لا يبدو هذا العنوان موقع ووردبريس.',
  ],
  [
    'This WordPress user is not allowed to publish posts. Use an Editor or Administrator account, or choose "Save as draft".',
    'Cet utilisateur WordPress n’a pas le droit de publier des articles. Utilisez un compte Éditeur ou Administrateur, ou choisissez « Enregistrer comme brouillon ».',
    'لا يُسمح لمستخدم ووردبريس هذا بنشر المقالات. استخدم حساب محرر أو مسؤول، أو اختر "حفظ كمسودة".',
  ],
  [
    'WordPress did not accept that username and application password. Create an application password in your profile (Users, then Profile, then Application Passwords) and use your username, not your email.',
    'WordPress n’a pas accepté ce nom d’utilisateur et ce mot de passe d’application. Créez un mot de passe d’application dans votre profil (Utilisateurs, puis Profil, puis Mots de passe d’application) et utilisez votre nom d’utilisateur, pas votre e-mail.',
    'لم يقبل ووردبريس اسم المستخدم وكلمة مرور التطبيق هذه. أنشئ كلمة مرور تطبيق في ملفك الشخصي (المستخدمون ثم الملف الشخصي ثم كلمات مرور التطبيقات) واستخدم اسم المستخدم لا بريدك الإلكتروني.',
  ],
  [
    'The WordPress REST API was not found at this address. Check the site address, and that permalinks are not blocking /wp-json.',
    'L’API REST de WordPress est introuvable à cette adresse. Vérifiez l’adresse du site et que les permaliens ne bloquent pas /wp-json.',
    'لم يتم العثور على واجهة REST API لووردبريس في هذا العنوان. تحقق من عنوان الموقع ومن أن الروابط الدائمة لا تحجب /wp-json.',
  ],
  [
    'This channel has no saved login. Reconnect it.',
    'Ce canal n’a pas d’identifiants enregistrés. Reconnectez-le.',
    'ليس لهذه القناة بيانات دخول محفوظة. أعد ربطها.',
  ],
  [
    'The article has no body or slug to publish.',
    'L’article n’a ni texte ni slug à publier.',
    'ليس للمقال نص أو مُعرّف رابط للنشر.',
  ],
  [
    'WordPress did not confirm the post.',
    'WordPress n’a pas confirmé la publication.',
    'لم يؤكد ووردبريس المنشور.',
  ],
  [
    'WordPress did not confirm the picture upload.',
    'WordPress n’a pas confirmé l’envoi de l’image.',
    'لم يؤكد ووردبريس رفع الصورة.',
  ],
  [
    'The site address is not allowed.',
    'L’adresse du site n’est pas autorisée.',
    'عنوان الموقع غير مسموح.',
  ],
  [
    'WordPress rejected the saved login (it may have been revoked or lacks permission). Reconnect the channel.',
    'WordPress a refusé les identifiants enregistrés (ils ont peut-être été révoqués ou n’ont pas les droits). Reconnectez le canal.',
    'رفض ووردبريس بيانات الدخول المحفوظة (قد تكون أُلغيت أو تنقصها الصلاحيات). أعد ربط القناة.',
  ],
  // ---- sources
  ['Invalid URL', 'URL invalide', 'الرابط غير صالح'],
  [
    'Only http and https URLs are allowed',
    'Seules les URL http et https sont autorisées',
    'يُسمح فقط بروابط http وhttps',
  ],
  [
    'URLs with credentials are not allowed',
    'Les URL contenant des identifiants ne sont pas autorisées',
    'الروابط التي تحتوي على بيانات دخول غير مسموحة',
  ],
  [
    'Only standard web ports are allowed',
    'Seuls les ports web standard sont autorisés',
    'يُسمح فقط بمنافذ الويب القياسية',
  ],
  ['This address is not allowed', 'Cette adresse n’est pas autorisée', 'هذا العنوان غير مسموح'],
  [
    'Could not resolve the website address',
    'Impossible de résoudre l’adresse du site',
    'تعذّر تحديد عنوان الموقع',
  ],
  [
    'The website took too long to respond',
    'Le site a mis trop de temps à répondre',
    'استغرق الموقع وقتًا طويلًا للرد',
  ],
  [
    'Could not connect to the website',
    'Impossible de se connecter au site',
    'تعذّر الاتصال بالموقع',
  ],
  [
    'The page is too large to import',
    'La page est trop volumineuse pour être importée',
    'الصفحة أكبر من أن يتم استيرادها',
  ],
  [
    'The website sent an invalid redirect',
    'Le site a envoyé une redirection invalide',
    'أرسل الموقع إعادة توجيه غير صالحة',
  ],
  [
    'This website does not allow automated access. Paste the text instead.',
    'Ce site n’autorise pas l’accès automatisé. Collez plutôt le texte.',
    'لا يسمح هذا الموقع بالوصول الآلي. الصق النص بدلًا من ذلك.',
  ],
  [
    'Only web pages and plain text can be imported from a URL',
    'Seules les pages web et le texte brut peuvent être importés depuis une URL',
    'يمكن استيراد صفحات الويب والنص العادي فقط من رابط',
  ],
  [
    'The website redirected too many times',
    'Le site a effectué trop de redirections',
    'أعاد الموقع التوجيه مرات كثيرة جدًا',
  ],
  [
    'Only PDF and DOCX files are supported',
    'Seuls les fichiers PDF et DOCX sont pris en charge',
    'يُدعم فقط ملفات PDF وDOCX',
  ],
  [
    'This URL is not allowed. Use a public http(s) web page.',
    'Cette URL n’est pas autorisée. Utilisez une page web publique en http(s).',
    'هذا الرابط غير مسموح. استخدم صفحة ويب عامة بـ http(s).',
  ],
  [
    'This website asks not to be imported automatically. Paste the text instead.',
    'Ce site demande à ne pas être importé automatiquement. Collez plutôt le texte.',
    'يطلب هذا الموقع عدم استيراده تلقائيًا. الصق النص بدلًا من ذلك.',
  ],
  [
    'The text is too long (max 200,000 characters)',
    'Le texte est trop long (200 000 caractères maximum)',
    'النص طويل جدًا (الحد الأقصى 200,000 حرف)',
  ],
  ['Source not found', 'Source introuvable', 'المصدر غير موجود'],
  ['Fact not found', 'Fait introuvable', 'الحقيقة غير موجودة'],
  [
    'No readable text found in this PDF. Scanned documents are not supported yet.',
    'Aucun texte lisible dans ce PDF. Les documents numérisés ne sont pas encore pris en charge.',
    'لم يُعثر على نص مقروء في ملف PDF هذا. المستندات الممسوحة ضوئيًا غير مدعومة بعد.',
  ],
  [
    'This PDF could not be read. It may be damaged or password protected.',
    'Ce PDF n’a pas pu être lu. Il est peut-être endommagé ou protégé par mot de passe.',
    'تعذّرت قراءة ملف PDF هذا. قد يكون تالفًا أو محميًا بكلمة مرور.',
  ],
  [
    'This DOCX could not be read. It may be damaged.',
    'Ce DOCX n’a pas pu être lu. Il est peut-être endommagé.',
    'تعذّرت قراءة ملف DOCX هذا. قد يكون تالفًا.',
  ],
  // ---- studio, approval, schedule, images
  [
    'Resolve the unsupported claims flagged in this content before submitting it for approval',
    'Corrigez les affirmations non vérifiées signalées dans ce contenu avant de le soumettre pour approbation',
    'عالج الادعاءات غير المدعومة المشار إليها في هذا المحتوى قبل إرساله للموافقة',
  ],
  [
    'Only content in review can be withdrawn',
    'Seul un contenu en relecture peut être retiré',
    'يمكن سحب المحتوى قيد المراجعة فقط',
  ],
  [
    'Only the person who submitted it can withdraw it',
    'Seule la personne qui l’a soumis peut le retirer',
    'لا يستطيع سحبه إلا من أرسله',
  ],
  [
    'Only content in review can be approved or sent back',
    'Seul un contenu en relecture peut être approuvé ou renvoyé',
    'يمكن اعتماد أو إعادة المحتوى قيد المراجعة فقط',
  ],
  ['This image is already attached', 'Cette image est déjà jointe', 'هذه الصورة مرفقة بالفعل'],
  ['That image is not attached', 'Cette image n’est pas jointe', 'هذه الصورة غير مرفقة'],
  [
    'There is no image idea for this content. Describe the picture.',
    'Ce contenu n’a pas d’idée d’image. Décrivez l’image.',
    'لا توجد فكرة صورة لهذا المحتوى. صف الصورة.',
  ],
  [
    'This content already has the maximum number of images.',
    'Ce contenu a déjà le nombre maximal d’images.',
    'بلغ هذا المحتوى الحد الأقصى لعدد الصور.',
  ],
  [
    'This content takes one image. Remove the current one first.',
    'Ce contenu accepte une seule image. Retirez d’abord l’image actuelle.',
    'يقبل هذا المحتوى صورة واحدة. أزل الصورة الحالية أولًا.',
  ],
  [
    'Only approved content can be scheduled',
    'Seul un contenu approuvé peut être planifié',
    'يمكن جدولة المحتوى المعتمد فقط',
  ],
  [
    'Choose a date and time in the future',
    'Choisissez une date et une heure dans le futur',
    'اختر تاريخًا ووقتًا في المستقبل',
  ],
  [
    'Schedule at most one year ahead',
    'Planifiez au plus un an à l’avance',
    'يمكن الجدولة لمدة سنة كحد أقصى',
  ],
  ['This content is not scheduled', 'Ce contenu n’est pas planifié', 'هذا المحتوى غير مجدول'],
  [
    'Extract and review the facts of this source before creating content.',
    'Extrayez et vérifiez les faits de cette source avant de créer du contenu.',
    'استخرج حقائق هذا المصدر وراجعها قبل إنشاء المحتوى.',
  ],
  [
    'This source has no verified facts yet. Review and confirm its facts first.',
    'Cette source n’a pas encore de faits vérifiés. Relisez et confirmez d’abord ses faits.',
    'ليس لهذا المصدر حقائق موثقة بعد. راجع حقائقه وأكدها أولًا.',
  ],
  [
    'The content is already in this language.',
    'Le contenu est déjà dans cette langue.',
    'المحتوى بهذه اللغة بالفعل.',
  ],
];

/** Messages with a changing part (a name, a number, a nested message). $1, $2 are filled from the match. */
const PATTERNS: readonly (readonly [RegExp, string, string])[] = [
  [/^Request failed \((\d+)\)$/, 'La requête a échoué ($1)', 'فشل الطلب ($1)'],
  [
    /^The website returned an error \((\d+)\)$/,
    'Le site a renvoyé une erreur ($1)',
    'أرجع الموقع خطأً ($1)',
  ],
  [
    /^(Facebook|Instagram|LinkedIn|WordPress) is not available right now \((\d+)\)\.$/,
    '$1 n’est pas disponible pour le moment ($2).',
    '$1 غير متاح حاليًا ($2).',
  ],
  [
    /^LinkedIn answered with an error \((\d+)\)\.$/,
    'LinkedIn a répondu par une erreur ($1).',
    'ردّ لينكدإن بخطأ ($1).',
  ],
  [
    /^The channel "(.*)" is not connected$/,
    'Le canal « $1 » n’est pas connecté',
    'القناة "$1" غير متصلة',
  ],
  [
    /^The channel "(.*)" cannot publish this type of content$/,
    'Le canal « $1 » ne peut pas publier ce type de contenu',
    'لا يمكن للقناة "$1" نشر هذا النوع من المحتوى',
  ],
  [/^Already published to "(.*)"$/, 'Déjà publié sur « $1 »', 'تم النشر بالفعل على "$1"'],
  [
    /^Already waiting to be published to "(.*)"$/,
    'Déjà en attente de publication sur « $1 »',
    'بانتظار النشر بالفعل على "$1"',
  ],
];

const BY_EN = new Map<string, Entry>(ENTRIES.map((e) => [e[0], e]));
export const SERVER_MESSAGE_KEYS: readonly string[] = ENTRIES.map((e) => e[0]);

/** Messages that open with a connection problem followed by a reason, e.g. "Could not connect to Facebook. <reason>". */
const CONNECT = /^Could not connect to (Facebook|Instagram|LinkedIn|the site)\. ([\s\S]+)$/;
const CONNECT_PREFIX: Record<string, { fr: string; ar: string }> = {
  Facebook: { fr: 'Connexion à Facebook impossible.', ar: 'تعذّر الاتصال بفيسبوك.' },
  Instagram: { fr: 'Connexion à Instagram impossible.', ar: 'تعذّر الاتصال بإنستغرام.' },
  LinkedIn: { fr: 'Connexion à LinkedIn impossible.', ar: 'تعذّر الاتصال بلينكدإن.' },
  'the site': { fr: 'Connexion au site impossible.', ar: 'تعذّر الاتصال بالموقع.' },
};

/** The message in the given language; English or unknown messages are returned unchanged. */
export function translateServerMessage(locale: Locale, message: string): string {
  if (locale === 'en') return message;
  const hit = BY_EN.get(message);
  if (hit) return locale === 'fr' ? hit[1] : hit[2];
  const c = CONNECT.exec(message);
  if (c) return `${CONNECT_PREFIX[c[1]][locale]} ${translateServerMessage(locale, c[2])}`;
  for (const [re, fr, ar] of PATTERNS) {
    const m = re.exec(message);
    if (m) return (locale === 'fr' ? fr : ar).replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
  }
  return message;
}
