// Deterministic red-flag rule table for the safety engine.
//
// Keys are written in natural English / Hindi / Hinglish and are canonicalized at
// load time by lib/text.js, so spelling variants ("mein"/"me", "khun"/"khoon") and
// Devanagari phrases resolve to the same rule without duplicating entries.
//
// Levels are intentionally coarse. This engine's only job is to decide whether the
// person in front of the screen needs emergency care, prompt care, or routine
// guidance — it never diagnoses.

export const RED_FLAGS = [
  {
    id: 'chest_pain',
    label: 'Chest pain or pressure',
    group: 'cardiac',
    keys: [
      'chest pain', 'chest tightness', 'chest pressure', 'chest heaviness',
      'heavy chest', 'crushing chest pain', 'pain in chest',
      'सीने में दर्द', 'सीने में जकड़न', 'छाती में दर्द',
      'seene me dard', 'seene me jakdan', 'chat me dard', 'chhati me dard',
      'dil me dard', 'heart pain'
    ]
  },
  {
    id: 'radiating_pain',
    label: 'Pain spreading to arm, jaw or back',
    group: 'cardiac',
    keys: [
      'pain radiating to left arm', 'pain in left arm and chest', 'jaw pain with chest',
      'pain going to shoulder and neck',
      'baaye hath me dard', 'baya hath me dard', 'left arm pain',
      'जबाड़े में दर्द', 'jabda me dard', 'baazu me dard'
    ]
  },
  {
    id: 'breathing_difficulty',
    label: 'Difficulty breathing',
    group: 'respiratory',
    keys: [
      'difficulty breathing', 'breathing difficulty', 'cannot breathe', "can't breathe",
      'unable to breathe', 'short of breath', 'breathlessness', 'gasping',
      'struggling to breathe', 'breathing problem', 'suffocating', 'out of breath',
      'सांस लेने में परेशानी', 'श्वास लेने में कठिनाई',
      'saans lene me pareshani', 'saans lene me dikkat', 'sans lene me taklif',
      'breath lene me dikkat', 'dam ghut raha'
    ]
  },
  {
    id: 'cyanosis',
    label: 'Blue or grey lips / face',
    group: 'respiratory',
    keys: [
      'blue lips', 'lips turning blue', 'blue face', 'cyanosis', 'grey lips',
      'hoth neele', 'honth neele', 'नीले होंठ', 'chehra neela'
    ]
  },
  {
    id: 'choking',
    label: 'Choking or blocked airway',
    group: 'airway',
    keys: [
      'choking', 'something stuck in throat', 'cannot speak', 'airway blocked',
      'gala ghut', 'गला घुट', 'khaana atak', 'food stuck in throat', 'drooling and cannot swallow'
    ]
  },
  {
    id: 'unconsciousness',
    label: 'Unconsciousness or fainting',
    group: 'neuro',
    keys: [
      'unconscious', 'fainted', 'fainting', 'passed out', 'not responding',
      'no response', 'cannot wake', "can't wake", 'unresponsive', 'collapsed',
      'बेहोश', 'बेहोशी', 'होश नहीं',
      'behosh', 'behoshi', 'hosh nahi', 'murcha', 'berosh'
    ]
  },
  {
    id: 'seizure',
    label: 'Seizure or convulsion',
    group: 'neuro',
    keys: [
      'seizure', 'convulsion', 'fit came', 'fits', 'twitching and unconscious',
      'दौरा', 'मिर्गी', 'daura', 'daura pada', 'mirgi', 'jhatake'
    ]
  },
  {
    id: 'stroke_signs',
    label: 'Possible stroke signs',
    group: 'neuro',
    keys: [
      'face drooping', 'one side of face drooped', 'one sided weakness', 'weakness on one side',
      'slurred speech', 'sudden speech problem', 'sudden confusion', 'sudden vision loss',
      'sudden blindness', 'cannot understand speech', 'loss of balance suddenly',
      'लकवा', 'मुंह टेढ़ा', 'बोलने में दिक्कत',
      'lakwa', 'muh teda', 'bolne me dikkat', 'ek taraf kamzori', 'baolan me takleef',
      'achanak bolna band', 'sudden numbness one side'
    ]
  },
  {
    id: 'sudden_weakness',
    label: 'Sudden severe weakness',
    group: 'neuro',
    keys: [
      'sudden severe weakness', 'sudden weakness', 'suddenly very weak', 'sudden collapse',
      'cannot stand up suddenly', 'extreme weakness suddenly', 'whole body went weak',
      'अचानक कमजोरी', 'achanak kamzori', 'achanak kamjori', 'achanak bahut kamzor',
      'poora sharir kamzor ho gaya', 'khada nahi ho pa raha'
    ]
  },
  {
    id: 'thunderclap_headache',
    label: 'Sudden worst-ever headache',
    group: 'neuro',
    keys: [
      'worst headache of my life', 'sudden severe headache', 'thunderclap headache',
      'headache like never before', 'sudden blinding headache',
      'sabse tez sir dard achanak', 'achanak bahut tez sir dard',
      'अचानक बहुत तेज सिरदर्द'
    ]
  },
  {
    id: 'severe_bleeding',
    label: 'Severe or uncontrolled bleeding',
    group: 'trauma',
    keys: [
      'severe bleeding', 'heavy bleeding', 'uncontrolled bleeding', 'bleeding not stopping',
      'blood loss', 'arterial bleeding', 'spurting blood', 'blood gushing',
      'बहुत खून', 'खून बह रहा', 'खून नहीं रुक',
      'bahut khoon', 'khoon bah raha', 'khoon nahi ruk', 'zyada khoon nikal', 'blood ruk nahi'
    ]
  },
  {
    id: 'major_trauma',
    label: 'Major injury (accident, fall, drowning, shock)',
    group: 'trauma',
    keys: [
      'road accident', 'car accident', 'bike accident', 'hit by vehicle', 'fell from height',
      'fall from height', 'drowning', 'nearly drowned', 'electric shock', 'electrocuted',
      'gunshot', 'stabbed', 'building collapsed', 'crushed',
      'accident ho gaya', 'takkar ho gayi', 'dubaai', 'current lag gaya',
      'बिजली का झटका', 'ऊंचाई से गिर', 'दुर्घटना'
    ]
  },
  {
    id: 'head_injury',
    label: 'Head injury with warning signs',
    group: 'trauma',
    keys: [
      'head injury with vomiting', 'hit on head and vomiting', 'skull fracture',
      'head injury bleeding from ear', 'confusion after head injury', 'bleeding from ear',
      'sar me chot aur ulti', 'sir me chot lagi',
      'सिर में चोट', 'कान से खून'
    ]
  },
  {
    id: 'severe_burns',
    label: 'Severe or extensive burns',
    group: 'trauma',
    keys: [
      'severe burn', 'extensive burns', 'burn over large area', 'full thickness burn',
      'charcoal skin', 'burn on face and neck', 'burn with breathing problem',
      'acid attack', 'acid burn',
      'bahut jal gaya', 'jyada jal gaya', 'तेज जलन', 'acid phenka'
    ]
  },
  {
    id: 'poisoning',
    label: 'Poisoning, overdose or harmful ingestion',
    group: 'toxicology',
    keys: [
      'poison', 'poisoning', 'consumed poison', 'overdose', 'too many pills',
      'drank pesticide', 'insecticide', 'rat poison', 'gas leak', 'carbon monoxide',
      'swallowed chemical', 'drank acid', 'alcohol poisoning',
      'जहर', 'ज़हर', 'zehar', 'zehar kha liya', 'dawa jyada kha li', 'goli jyada',
      'keede maar dawa', 'gas leak ho gaya', 'phosphas'
    ]
  },
  {
    id: 'snake_bite',
    label: 'Snake bite or venomous animal bite',
    group: 'toxicology',
    keys: [
      'snake bite', 'bitten by snake', 'cobra bite', 'viper bite', 'scorpion sting severe',
      'सांप ने काटा', 'saanp ne kata', 'saanp kata', 'vishaila saanp', 'snake ne dasa'
    ]
  },
  {
    id: 'anaphylaxis',
    label: 'Serious allergic reaction',
    group: 'allergy',
    keys: [
      'anaphylaxis', 'severe allergic reaction', 'allergic reaction with breathing',
      'face swelling with breathing', 'throat closing', 'swelling of tongue and lips',
      'hives and breathless', 'allergy after injection',
      'गंभीर एलर्जी', 'gambhir allergy', 'allergy ho gayi aur saans', 'chehra soojh gaya saans'
    ]
  },
  {
    id: 'pregnancy_emergency',
    label: 'Pregnancy emergency',
    group: 'obstetric',
    keys: [
      'bleeding in pregnancy', 'bleeding while pregnant', 'pregnant and bleeding',
      'severe abdominal pain pregnant', 'pregnant and fits', 'water broke and bleeding',
      'no fetal movement', 'baby not moving in womb', 'high bp in pregnancy', 'eclampsia',
      'pregnant lady bleeding', 'labor pain with heavy bleeding',
      'गर्भावस्था में खून', 'pregnant aur khoon', 'garbhavati ko khoon',
      'pregnant aur daura', 'baccha hil nahi raha'
    ]
  },
  {
    id: 'infant_danger',
    label: 'Infant danger sign',
    group: 'pediatric',
    keys: [
      'baby not feeding', 'newborn not breastfeeding', 'infant not moving', 'baby very lethargic',
      'baby fast breathing', 'baby chest indrawing', 'baby blue', 'baby cold to touch',
      'baby seizure', 'fever in baby under 3 months', 'newborn fever', 'baby not waking to feed',
      'bachcha doodh nahi pee raha', 'bachcha sust hai', 'bachche ki saans tez',
      'नवजात', 'bachcha behosh', 'navjat ko bukhar'
    ]
  },
  {
    id: 'meningism',
    label: 'Fever with neck stiffness or rash',
    group: 'infection',
    keys: [
      'fever with neck stiffness', 'stiff neck and fever', 'neck stiffness', 'stiff neck',
      'fever and rash not fading', 'rash does not blanch', 'fever with sensitivity to light',
      'photophobia and fever',
      'bukhar aur gardan akad', 'bukhar aur daane', 'gardan akad',
      'गर्दन में जकड़न', 'gardan me jakdan', 'bukhar me daane'
    ]
  },
  {
    id: 'shock',
    label: 'Signs of shock',
    group: 'circulatory',
    keys: [
      'cold clammy skin', 'pale and cold sweating', 'weak rapid pulse', 'shock',
      'skin mottled', 'very low blood pressure', 'fainting on standing repeatedly',
      'thanda paseena', 'body thandi ho gayi', 'nabz bahut tez aur kamzor',
      'ठंडा पसीना', 'shock me chale gaye'
    ]
  },
  {
    id: 'vomiting_blood',
    label: 'Vomiting blood or passing black stools',
    group: 'gi',
    keys: [
      'vomiting blood', 'blood in vomit', 'coughing blood', 'black tarry stool',
      'blood in stool heavy', 'coffee ground vomit', 'hematemesis', 'haemoptysis',
      'ulti me khoon', 'mal me khoon', 'khoon ki ulti',
      'उल्टी में खून', 'खांसी में खून'
    ]
  },
  {
    id: 'urinary_obstruction',
    label: 'Unable to pass urine with severe pain',
    group: 'renal',
    keys: [
      'cannot pass urine', 'unable to urinate', 'no urine for 24 hours', 'urine retention',
      'peshab nahi aa raha', 'पेशाब नहीं आ रहा', 'urine band ho gaya'
    ]
  }
];

export const URGENT_FLAGS = [
  {
    id: 'high_fever',
    label: 'High fever',
    keys: [
      'high fever', 'very high fever', 'fever 102', 'fever 103', 'fever not coming down',
      'persistent fever', 'fever with chills and rigors',
      'तेज बुखार', 'bahut tez bukhar', 'tez bukhar', 'bukhar nahi utar', 'high bukhar'
    ]
  },
  {
    id: 'persistent_vomiting',
    label: 'Persistent vomiting',
    keys: [
      'persistent vomiting', 'vomiting repeatedly', 'cannot keep fluids down',
      'vomiting everything', 'continuous vomiting',
      'बार बार उल्टी', 'bar bar ulti', 'ulti ruk nahi', 'kuch nahi tik raha'
    ]
  },
  {
    id: 'severe_pain',
    label: 'Severe pain',
    keys: [
      'severe pain', 'unbearable pain', 'worst pain', 'excruciating pain', 'very bad pain',
      'बहुत तेज दर्द', 'bahut tez dard', 'bardasht se bahar dard', 'dard saha nahi ja raha'
    ]
  },
  {
    id: 'dehydration',
    label: 'Dehydration',
    keys: [
      'dehydration', 'dehydrated', 'very dry mouth', 'no tears', 'sunken eyes',
      'skin tenting', 'not urinating all day', 'loose motion many times',
      'paani ki kami', 'munh sookh', 'bahut dast', 'पानी की कमी'
    ]
  },
  {
    id: 'blood_urine_stool',
    label: 'Blood in urine or stool',
    keys: [
      'blood in urine', 'blood in stool', 'blood while urinating', 'bloody diarrhoea',
      'peshab me khoon', 'पेशाब में खून', 'motion me khoon', 'blood aaya peshab me'
    ]
  },
  {
    id: 'breathless_exertion',
    label: 'Breathlessness on mild exertion',
    keys: [
      'breathless on walking', 'breathless climbing stairs', 'cannot lie flat breathing',
      'waking up gasping at night', 'breathless while talking',
      'chalne me saans phool', 'seedhi chadne me saans', 'letne pe saans'
    ]
  },
  {
    id: 'swelling',
    label: 'New swelling of legs, face or abdomen',
    keys: [
      'swelling in legs', 'swollen feet', 'pitting edema', 'swelling of face',
      'abdominal swelling', 'sudden weight gain with swelling',
      'पैर में सूजन', 'pair me sujan', 'chehra soojha', 'pairo me soojan'
    ]
  },
  {
    id: 'laceration',
    label: 'Deep cut likely needing stitches',
    keys: [
      'deep cut', 'gaping wound', 'cut needs stitches', 'wound not closing', 'laceration',
      'gehra ghav', 'गहरा घाव', 'ghav gehra hai', 'taanka lagana'
    ]
  },
  {
    id: 'fracture',
    label: 'Suspected fracture or dislocation',
    keys: [
      'fracture', 'bone broken', 'suspected fracture', 'dislocated shoulder', 'joint out of place',
      'bone deformity', 'cannot move the limb',
      'haddi toot', 'हड्डी टूट', 'haddi tut gayi', 'joint nikal gaya'
    ]
  },
  {
    id: 'animal_bite',
    label: 'Animal or dog bite',
    keys: [
      'dog bite', 'bitten by dog', 'monkey bite', 'cat bite deep', 'stray dog bite', 'rabies exposure',
      'कुत्ते ने काटा', 'kutte ne kata', 'kutta kaat liya', 'dog ne kat liya'
    ]
  },
  {
    id: 'jaundice',
    label: 'Yellowing of eyes or skin',
    keys: [
      'jaundice', 'yellow eyes', 'yellow skin', 'yellowing of eyes',
      'पीलिया', 'peeliya', 'aankh peeli', 'skin peeli'
    ]
  },
  {
    id: 'urinary_pain',
    label: 'Painful urination or urinary infection',
    keys: [
      'painful urination', 'burning while urinating', 'urinary tract infection', 'uti',
      'frequent urination with pain',
      'peshab me jalan', 'पेशाब में जलन', 'urine karte waqt dard'
    ]
  },
  {
    id: 'persistent_diarrhoea',
    label: 'Persistent diarrhoea',
    keys: [
      'persistent diarrhoea', 'diarrhea for days', 'loose motion repeatedly',
      'dast nahi ruk', 'बार बार दस्त', 'bar bar dast', 'loose motion bahut'
    ]
  },
  {
    id: 'eye_injury',
    label: 'Eye injury or sudden vision change',
    keys: [
      'eye injury', 'chemical in eye', 'sudden blurred vision', 'loss of vision in one eye',
      'something in the eye', 'aankh me chot', 'आंख में चोट', 'aankh me kuch chala', 'dhundhla dikhai'
    ]
  },
  {
    id: 'mental_distress',
    label: 'Significant mental distress',
    keys: [
      'panic attack', 'severe anxiety', 'cannot sleep for days', 'feeling hopeless',
      'very depressed', 'hearing voices', 'extreme stress',
      'ghabrahat bahut', 'neend nahi aati', 'bahut tension', 'udaas bahut', 'मानसिक तनाव'
    ]
  },
  {
    id: 'pregnancy_concern',
    label: 'Pregnancy concern needing review',
    keys: [
      'pregnant and vomiting a lot', 'pregnant with headache', 'pregnant with swelling',
      'reduced fetal movement', 'mild spotting in pregnancy', 'pregnancy pain',
      'pregnant aur ulti', 'गर्भावस्था में दिक्कत', 'pregnant me dard'
    ]
  },
  {
    id: 'chronic_uncontrolled',
    label: 'Uncontrolled chronic condition',
    keys: [
      'sugar not controlled', 'diabetes out of control', 'bp always high',
      'insulin not working', 'sugar very high', 'sugar very low',
      'शुगर बढ़', 'sugar badh gayi', 'bp badha hua'
    ]
  }
];

// Distinct pathway: same top priority as a physical emergency, but routed to
// mental-health resources instead of an ambulance by default.
export const CRISIS_FLAGS = [
  {
    id: 'self_harm',
    label: 'Talk of self-harm or suicide',
    keys: [
      'suicide', 'kill myself', 'want to die', 'end my life', 'self harm', 'hurt myself',
      'no reason to live', 'better off dead', 'cut myself',
      'आत्महत्या', 'खुद को नुकसान', 'जान देना', 'मार डालूंगा खुद को', 'आत्महत्या करना',
      'aatmahatya', 'khud ko nuksan', 'apne aap ko nuksan', 'nuksan pahunchana',
      'nuksan pahuncha', 'nuksan karna', 'khudkushi', 'jaan dena', 'khud ko maar',
      'marna chahta', 'jeene ki ichha nahi'
    ]
  },
  {
    id: 'harm_others',
    label: 'Talk of harming someone else',
    keys: [
      'kill someone', 'want to kill', 'harm my family', 'attack someone',
      'kisi ko maar', 'मार डालूंगा', 'kisi pe attack'
    ]
  }
];

// Anatomical sites, surfaced in the structured summary a clinician would read.
export const BODY_SITES = [
  { id: 'head', label: 'Head', keys: ['head', 'sir', 'sar', 'सिर', 'skull'] },
  { id: 'chest', label: 'Chest', keys: ['chest', 'seene', 'chhati', 'सीना', 'छाती'] },
  { id: 'abdomen', label: 'Abdomen', keys: ['stomach', 'abdomen', 'pet', 'belly', 'पेट'] },
  { id: 'neck', label: 'Neck', keys: ['neck', 'gardan', 'गर्दन', 'throat', 'gala'] },
  { id: 'arm', label: 'Arm or hand', keys: ['arm', 'hand', 'hath', 'haath', 'बांह', 'हाथ'] },
  { id: 'leg', label: 'Leg or foot', keys: ['leg', 'foot', 'pair', 'taang', 'पैर', 'टांग'] },
  { id: 'back', label: 'Back', keys: ['back', 'kamar', 'spine', 'पीठ', 'कमर'] },
  { id: 'eye', label: 'Eye', keys: ['eye', 'aankh', 'आंख'] },
  { id: 'ear', label: 'Ear', keys: ['ear', 'kaan', 'कान'] },
  { id: 'urinary', label: 'Urinary', keys: ['urine', 'peshab', 'पेशाब', 'bladder'] },
  { id: 'skin', label: 'Skin', keys: ['skin', 'twacha', 'त्वचा', 'rash', 'daane'] },
  { id: 'joint', label: 'Joints', keys: ['joint', 'jod', 'घुटना', 'knee', 'ghutna'] }
];

// --- Combination rules -----------------------------------------------------
// Phrase matching alone misses the dangerous cases, because people describe them
// in free order: "pregnant hoon aur khoon aa raha hai" contains no contiguous
// phrase like "bleeding in pregnancy". A combination rule fires only when EVERY
// group matches (each group is satisfied by ANY of its keys), so it stays precise
// while being insensitive to word order and intervening words.

export const COMBINATION_RULES = [
  {
    id: 'pregnancy_bleeding',
    label: 'Pregnancy emergency',
    level: 'emergency',
    group: 'obstetric',
    allOf: [
      ['pregnant', 'pregnancy', 'garbhavati', 'garbh', 'delivery', 'labor', 'labour', 'antenatal'],
      ['khoon', 'bleeding', 'bleed', 'spotting', 'blood', 'clots']
    ]
  },
  {
    id: 'pregnancy_seizure',
    label: 'Pregnancy emergency',
    level: 'emergency',
    group: 'obstetric',
    allOf: [
      ['pregnant', 'pregnancy', 'garbhavati', 'delivery', 'labor', 'labour'],
      ['daura', 'seizure', 'convulsion', 'behosh', 'unconscious', 'fits', 'eclampsia']
    ]
  },
  {
    id: 'head_injury_warning',
    label: 'Head injury with warning signs',
    level: 'emergency',
    group: 'trauma',
    allOf: [
      ['sir me chot', 'head injury', 'sar me chot', 'sir par chot', 'gir gaya', 'gir gayi', 'fall', 'hit head', 'chot lagi', 'takkar'],
      ['ulti', 'vomiting', 'behosh', 'unconscious', 'confusion', 'kan se khoon', 'bleeding from ear', 'neend', 'drowsy', 'bol nahi pa']
    ]
  },
  {
    id: 'fever_meningism',
    label: 'Fever with neck stiffness or rash',
    level: 'emergency',
    group: 'infection',
    allOf: [
      ['bukhar', 'fever', 'temperature'],
      ['gardan me akad', 'gardan akad', 'neck stiffness', 'stiff neck', 'daane', 'rash', 'roshni se takleef', 'light sensitivity', 'photophobia']
    ]
  },
  {
    id: 'bleeding_shock',
    label: 'Severe blood loss with shock signs',
    level: 'emergency',
    group: 'circulatory',
    allOf: [
      ['khoon', 'bleeding', 'blood', 'bleed'],
      ['chakkar', 'dizzy', 'behosh', 'faint', 'thanda paseena', 'cold sweat', 'peela', 'pale', 'kamzor', 'weak']
    ]
  },
  {
    id: 'burn_critical_area',
    label: 'Severe or extensive burns',
    level: 'emergency',
    group: 'trauma',
    allOf: [
      ['jal', 'burn', 'jala', 'scald', 'acid', 'aag'],
      ['chehra', 'face', 'gardan', 'neck', 'genital', 'private', 'bada hissa', 'large area', 'saans', 'breathing', 'bachcha', 'baby', 'poora sharir']
    ]
  },
  {
    id: 'fluid_loss_dehydration',
    label: 'Dehydration',
    level: 'urgent',
    group: 'gi',
    allOf: [
      ['ulti', 'vomiting', 'dast', 'diarrhoea', 'diarrhea', 'loose motion'],
      ['paani nahi', 'cannot drink', 'sukh', 'dry', 'chakkar', 'dizzy', 'peshab nahi', 'kamzor', 'weak']
    ]
  },
  {
    // People rarely say the contiguous phrase "chest pain": "chest mein bahut
    // dard hai" puts the intensity word between the site and the pain word.
    id: 'chest_pain_free_order',
    label: 'Chest pain or pressure',
    level: 'emergency',
    group: 'cardiac',
    allOf: [
      ['chest', 'seene', 'सीना', 'छाती'],
      ['dard', 'pain', 'taklif', 'jakdan', 'pressure', 'tightness', 'heaviness', 'bhari', 'ache']
    ]
  },
  {
    // Same for breathing: "saans lene mein problem ho rahi hai". The first group
    // deliberately excludes the bare word "saans" so an unrelated mention of
    // breathing ("saans normal hai") cannot pair with a problem elsewhere.
    id: 'breathing_difficulty_free_order',
    label: 'Difficulty breathing',
    level: 'emergency',
    group: 'respiratory',
    allOf: [
      ['saans lene', 'saans le', 'saans me', 'saans nahi', 'breathing', 'breath', 'श्वास', 'सांस ले'],
      ['problem', 'dikkat', 'taklif', 'pareshani', 'difficulty', 'ghut', 'phool', 'ruk', 'nahi aa', 'nahi le']
    ]
  }
];

// Persons other than the speaker — used to tell the UI that a caregiver is
// reporting on someone else, which changes the recommended next step.
export const THIRD_PERSON = [
  'maa', 'ma', 'mother', 'papa', 'father', 'beta', 'son', 'beti', 'daughter',
  'bachcha', 'baby', 'husband', 'pati', 'wife', 'patni', 'bhai', 'brother',
  'behen', 'sister', 'dadi', 'nani', 'dada', 'nana', 'padosi', 'neighbour',
  'neighbor', 'friend', 'dost', 'patient', 'mareez', 'she', 'he', 'usko', 'unko'
];

// Very young children. Kept separate from CHILD_CONTEXT because fever thresholds
// differ sharply: any fever under 3 months is an emergency, while the same fever
// in a 4-year-old is usually urgent.
export const INFANT_CONTEXT = [
  'newborn', 'infant', 'navjat', 'baby', 'mahine ka', 'mahine ki',
  'month old', 'months old', 'week old', 'weeks old', 'din ka bachcha'
];

export const CHILD_CONTEXT = [
  'bachcha', 'bacha', 'beta', 'beti', 'child', 'ladka', 'ladki', 'boy', 'girl', 'kid', 'son', 'daughter'
];

export const PREGNANCY_CONTEXT = ['pregnant', 'pregnancy', 'garbhavati', 'garbh', 'delivery', 'labor', 'labour'];
export const ELDERLY_CONTEXT = ['elderly', 'old age', 'bujurg', 'buzurg', 'years old', 'saal ke', 'saal ki', 'senior citizen'];
