/** Guide content: simulated logic chips, drivers, sensors, motors, relays and instruments. */
import type { BoardPins, GuideEntry, L } from './types';

const GND: BoardPins = ['GND', 'GND'];
const V5: BoardPins = ['5V', 'VBUS'];
const VCC: BoardPins = ['5V', '3V3'];
const NONE: BoardPins = ['', ''];
const I2C: Record<string, BoardPins> = { SDA: ['A4', 'GP4'], SCL: ['A5', 'GP5'] };

const P_GND: L = ['Ground.', 'الأرضي.'];
const P_VCC: L = ['Supply (5 V).', 'التغذية (5 فولت).'];
const P_SDA: L = ['I2C data.', 'بيانات I2C.'];
const P_SCL: L = ['I2C clock.', 'ساعة I2C.'];

// ---------------------------------------------------------------- logic gates

type Gate = { ar: string; op: L; truth: L; inputs: 1 | 2; count: number };

function gateChip(g: Gate): GuideEntry {
  const pins: Record<string, L> = { VCC: ['Supply, pin 14: 5V (2–6 V).', 'التغذية، الطرف 14: 5V (من 2 إلى 6 فولت).'], GND: ['Ground, pin 7.', 'الأرضي، الطرف 7.'] };
  for (let n = 1; n <= g.count; n++) {
    pins[`${n}A`] = [`Input A of gate ${n}.`, `الدخل A للبوابة ${n}.`];
    if (g.inputs === 2) pins[`${n}B`] = [`Input B of gate ${n}.`, `الدخل B للبوابة ${n}.`];
    pins[`${n}Y`] = [`Output of gate ${n}.`, `خرج البوابة ${n}.`];
  }
  return {
    ar: g.ar,
    what: [`${g.count} ${g.op[0]} gates in one 14-pin chip (74HC family, CMOS).`, `${g.count} بوابات ${g.op[1]} في شريحة واحدة بـ 14 طرفاً (عائلة 74HC، تقنية CMOS).`],
    uses: [
      ['Learn and test digital logic without a microcontroller.', 'تعلّم المنطق الرقمي واختباره بدون متحكم.'],
      ['Combine signals: enable, alarm and safety conditions.', 'دمج الإشارات: شروط التمكين والإنذار والأمان.'],
    ],
    steps: [
      ['Place the chip across the middle gap of the breadboard.', 'ضع الشريحة فوق الفجوة الوسطى للوحة التجارب.'],
      ['VCC (pin 14) → 5V, GND (pin 7) → GND.', 'VCC (الطرف 14) ← 5V و GND (الطرف 7) ← GND.'],
      ['Inputs (A, B) to switches or board pins; each output (Y) to an LED through 220 Ω.', 'المداخل (A و B) إلى مفاتيح أو أطراف اللوحة؛ وكل خرج (Y) إلى LED عبر 220 أوم.'],
    ],
    tips: [
      g.truth,
      ['Never leave unused inputs floating: tie them to GND.', 'لا تترك المداخل غير المستخدمة عائمة: صِلها بـ GND.'],
    ],
    pins,
    board: { VCC, GND, '1A': ['D2', 'GP14'], ...(g.inputs === 2 ? { '1B': ['D3', 'GP13'] as BoardPins } : {}), '1Y': ['D4', 'GP12'] },
  };
}

const GATES: Record<string, GuideEntry> = {
  'evlab.74hc00': gateChip({ ar: 'شريحة NAND رباعية 74HC00', op: ['two-input NAND', 'NAND ثنائية الدخل'], truth: ['NAND: the output is LOW only when both inputs are HIGH.', 'NAND: يكون الخرج LOW فقط عندما يكون الدخلان HIGH.'], inputs: 2, count: 4 }),
  'evlab.74hc02': gateChip({ ar: 'شريحة NOR رباعية 74HC02', op: ['two-input NOR', 'NOR ثنائية الدخل'], truth: ['NOR: the output is HIGH only when both inputs are LOW.', 'NOR: يكون الخرج HIGH فقط عندما يكون الدخلان LOW.'], inputs: 2, count: 4 }),
  'evlab.74hc04': gateChip({ ar: 'شريحة عاكسات سداسية 74HC04', op: ['NOT (inverter)', 'NOT (عاكس)'], truth: ['NOT: the output is the opposite of the input.', 'NOT: الخرج عكس الدخل.'], inputs: 1, count: 6 }),
  'evlab.74hc08': gateChip({ ar: 'شريحة AND رباعية 74HC08', op: ['two-input AND', 'AND ثنائية الدخل'], truth: ['AND: the output is HIGH only when both inputs are HIGH.', 'AND: يكون الخرج HIGH فقط عندما يكون الدخلان HIGH.'], inputs: 2, count: 4 }),
  'evlab.74hc32': gateChip({ ar: 'شريحة OR رباعية 74HC32', op: ['two-input OR', 'OR ثنائية الدخل'], truth: ['OR: the output is HIGH when at least one input is HIGH.', 'OR: يكون الخرج HIGH عندما يكون أحد الدخلين على الأقل HIGH.'], inputs: 2, count: 4 }),
  'evlab.74hc86': gateChip({ ar: 'شريحة XOR رباعية 74HC86', op: ['two-input XOR', 'XOR ثنائية الدخل'], truth: ['XOR: the output is HIGH when the inputs differ.', 'XOR: يكون الخرج HIGH عندما يختلف الدخلان.'], inputs: 2, count: 4 }),
};

// ---------------------------------------------------------------- shift register and driver

const Q_PINS = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((q): [string, L] => [`Q${q}`, [`Parallel output ${q}.`, `الخرج المتوازي ${q}.`]]));

const SHIFT_595: GuideEntry = {
  ar: 'سجل إزاحة 74HC595',
  what: ['Turns three board pins into eight outputs: bits are shifted in one at a time (SER and SRCLK) and copied to the outputs QA–QH by a pulse on RCLK.', 'يحوّل ثلاثة أطراف من اللوحة إلى ثمانية مخارج: تُدخَل البتات واحداً تلو الآخر (SER و SRCLK) ثم تُنسخ إلى المخارج QA–QH بنبضة على RCLK.'],
  uses: [['Drive many LEDs or a 7-segment display.', 'قيادة عدد كبير من الـ LED أو شاشة سباعية المقاطع.'], ['Chain several chips for 16, 24… outputs.', 'ربط عدة شرائح للحصول على 16 أو 24 مخرجاً…']],
  steps: [
    ['VCC → 5V, GND → GND; OE → GND (outputs on); SRCLR → 5V (no clear).', 'VCC ← 5V و GND ← GND؛ OE ← GND (المخارج مفعّلة)؛ SRCLR ← 5V (بلا مسح).'],
    ['SER (data) → 11, SRCLK (shift clock) → 13, RCLK (latch) → 10.', 'SER (البيانات) ← 11، SRCLK (ساعة الإزاحة) ← 13، RCLK (التثبيت) ← 10.'],
    ['QA–QH → LEDs through 220 Ω resistors.', 'QA–QH ← الـ LED عبر مقاومات 220 أوم.'],
  ],
  code: `const int DATA = 11, CLOCK = 13, LATCH = 10;

void setup() {
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
}

void loop() {
  for (int i = 0; i < 256; i++) {
    digitalWrite(LATCH, LOW);
    shiftOut(DATA, CLOCK, MSBFIRST, i);
    digitalWrite(LATCH, HIGH);
    delay(100);
  }
}`,
  tips: [['To chain chips: QH’ → SER of the next chip, and share SRCLK and RCLK.', 'لربط الشرائح: QH’ ← SER في الشريحة التالية، مع مشاركة SRCLK و RCLK.']],
  pins: {
    ...Q_PINS,
    "QH'": ['Serial output: to SER of the next chip.', 'الخرج التسلسلي: إلى SER في الشريحة التالية.'],
    SER: ['Serial data input.', 'دخل البيانات التسلسلي.'],
    SRCLK: ['Shift clock: each rising edge shifts in one bit.', 'ساعة الإزاحة: كل حافة صاعدة تُدخل بتاً واحداً.'],
    RCLK: ['Latch clock: a rising edge copies the bits to the outputs.', 'ساعة التثبيت: الحافة الصاعدة تنسخ البتات إلى المخارج.'],
    OE: ['Output enable, active LOW: to GND.', 'تمكين المخارج، فعّال عند LOW: إلى GND.'],
    SRCLR: ['Clear, active LOW: to 5V.', 'المسح، فعّال عند LOW: إلى 5V.'],
    VCC: P_VCC,
    GND: P_GND,
  },
  board: {
    SER: ['D11', 'GP19'],
    SRCLK: ['D13', 'GP18'],
    RCLK: ['D10', 'GP17'],
    OE: GND,
    SRCLR: VCC,
    VCC,
    GND,
  },
};

const ULN2003: GuideEntry = {
  ar: 'مصفوفة دارلنغتون ULN2003',
  what: ['Seven transistor switches (Darlington pairs) in one chip. A HIGH input pulls the matching output to GND, sinking up to 500 mA.', 'سبعة مفاتيح ترانزستور (أزواج دارلنغتون) في شريحة واحدة. الدخل HIGH يسحب الخرج المقابل إلى GND، بتيار حتى 500 ملي أمبير.'],
  uses: [['Drive relays, solenoids and lamps.', 'قيادة المرحّلات والملفات اللولبية والمصابيح.'], ['Drive unipolar stepper motors (28BYJ-48).', 'قيادة المحركات الخطوية أحادية القطب (28BYJ-48).']],
  steps: [
    ['GND → GND, shared with the board.', 'GND ← GND، مشترك مع اللوحة.'],
    ['IN1…IN7 → output pins.', 'IN1…IN7 ← أطراف الإخراج.'],
    ['Each load between the + supply and its OUT pin.', 'كل حمل بين التغذية الموجبة وطرف OUT الخاص به.'],
    ['COM → the + supply of the loads (enables the built-in flyback diodes).', 'COM ← التغذية الموجبة للأحمال (يفعّل ثنائيات الحماية المدمجة).'],
  ],
  tips: [['The outputs only sink current to GND: they cannot drive a load to +.', 'المخارج تسحب التيار إلى GND فقط: لا تستطيع تغذية الحمل بالموجب.']],
  pins: {
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].flatMap((n): [string, L][] => [
      [`IN${n}`, [`Input ${n} (from a board pin).`, `الدخل ${n} (من طرف اللوحة).`]],
      [`OUT${n}`, [`Output ${n}: pulled to GND when IN${n} is HIGH.`, `الخرج ${n}: يُسحب إلى GND عندما يكون IN${n} بحالة HIGH.`]],
    ])),
    COM: ['Common of the flyback diodes: to the load supply.', 'مشترك ثنائيات الحماية: إلى تغذية الأحمال.'],
    GND: P_GND,
  },
  board: { IN1: ['D8', 'GP2'], IN2: ['D9', 'GP3'], IN3: ['D10', 'GP4'], IN4: ['D11', 'GP5'], GND },
};

// ---------------------------------------------------------------- sensors

const MODULE_SUPPLY_STEP: L = ['VCC → 5V, GND → GND.', 'VCC ← 5V و GND ← GND.'];

const DHT22: GuideEntry = {
  ar: 'حساس حرارة ورطوبة DHT22',
  what: ['Measures temperature and humidity and sends both digitally over a single data wire.', 'يقيس الحرارة والرطوبة ويرسلهما رقمياً عبر سلك بيانات واحد.'],
  uses: [['Weather stations and room monitors.', 'محطات الطقس ومراقبة الغرف.'], ['Greenhouses, incubators and fan control.', 'البيوت الزجاجية والحاضنات والتحكم بالمراوح.']],
  steps: [
    MODULE_SUPPLY_STEP,
    ['SDA (data) → pin 2, with a 10 kΩ pull-up to VCC on a real sensor.', 'SDA (البيانات) ← الطرف 2، مع مقاومة رفع 10 كيلو أوم إلى VCC في الحساس الحقيقي.'],
  ],
  code: `#include <DHT.h>
DHT dht(2, DHT22);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  Serial.print(dht.readTemperature());
  Serial.print(" C  ");
  Serial.print(dht.readHumidity());
  Serial.println(" %");
  delay(2000);
}`,
  tips: [['Read it at most once every 2 seconds.', 'اقرأه مرة كل ثانيتين على الأكثر.'], ['Set the temperature and humidity in the Inspector while simulating.', 'اضبط الحرارة والرطوبة من لوحة الخصائص أثناء المحاكاة.']],
  pins: { VCC: ['Supply, 3.3–5 V.', 'التغذية، من 3.3 إلى 5 فولت.'], SDA: ['Data (single wire).', 'البيانات (سلك واحد).'], NC: ['Not connected.', 'غير موصول.'], GND: P_GND },
  board: { VCC, SDA: ['D2', 'GP15'], NC: NONE, GND },
};

const DHT11: GuideEntry = {
  ...DHT22,
  ar: 'وحدة حرارة ورطوبة DHT11',
  what: ['A basic temperature and humidity sensor on a small board with its pull-up resistor. Readings are whole numbers.', 'حساس حرارة ورطوبة بسيط على لوحة صغيرة مع مقاومة الرفع. قراءاته أعداد صحيحة.'],
  steps: [MODULE_SUPPLY_STEP, ['DATA → pin 2.', 'DATA ← الطرف 2.']],
  code: DHT22.code!.replace('DHT22', 'DHT11'),
  pins: { VCC: ['Supply, 3.3–5 V.', 'التغذية، من 3.3 إلى 5 فولت.'], DATA: ['Data (single wire).', 'البيانات (سلك واحد).'], GND: P_GND },
  board: { VCC, DATA: ['D2', 'GP15'], GND },
};

const NTC_MODULE: GuideEntry = {
  ar: 'وحدة حساس حرارة NTC',
  what: ['A thermistor and a fixed resistor on a small board. OUT gives a voltage that rises with temperature.', 'مقاومة حرارية ومقاومة ثابتة على لوحة صغيرة. يعطي OUT جهداً يرتفع مع الحرارة.'],
  uses: [['Measure air or liquid temperature.', 'قياس حرارة الهواء أو السوائل.'], ['Overheating alarms.', 'إنذارات السخونة الزائدة.']],
  steps: [MODULE_SUPPLY_STEP, ['OUT → A0; read it with `analogRead(A0)`.', 'OUT ← A0؛ واقرأه بـ `analogRead(A0)`.']],
  pins: { VCC: P_VCC, GND: P_GND, OUT: ['Voltage that rises with temperature.', 'جهد يرتفع مع الحرارة.'] },
  board: { VCC, GND, OUT: ['A0', 'GP26'] },
};

const LDR_MODULE: GuideEntry = {
  ar: 'وحدة حساس الضوء',
  what: ['A light sensor board with two outputs: AO, a voltage that rises with light, and DO, a digital signal from a comparator.', 'لوحة حساس ضوء بمخرجين: AO جهد يرتفع مع الضوء، و DO إشارة رقمية من مقارن.'],
  uses: [['Automatic night lights.', 'إنارة ليلية تلقائية.'], ['Detect a beam being interrupted.', 'كشف انقطاع شعاع ضوئي.']],
  steps: [MODULE_SUPPLY_STEP, ['AO → A0 for the light level, DO → pin 2 for bright/dark.', 'AO ← A0 لمستوى الضوء، و DO ← الطرف 2 لحالة مضيء/مظلم.']],
  tips: [['DO goes LOW when it is brighter than the threshold (the potentiometer on the board).', 'يصبح DO بحالة LOW عندما يكون الضوء أقوى من العتبة (المقاومة المتغيرة على اللوحة).']],
  pins: { VCC: P_VCC, GND: P_GND, AO: ['Analog light level (higher = brighter).', 'مستوى الضوء التماثلي (أعلى = أكثر إضاءة).'], DO: ['Digital output: LOW when brighter than the threshold.', 'خرج رقمي: LOW عندما يتجاوز الضوء العتبة.'] },
  board: { VCC, GND, AO: ['A0', 'GP26'], DO: ['D2', 'GP15'] },
};

const MQ2: GuideEntry = {
  ar: 'حساس الغاز والدخان MQ-2',
  what: ['Senses combustible gas (LPG, methane) and smoke. AOUT rises with the gas level; DOUT switches at a threshold.', 'يتحسس الغازات القابلة للاشتعال (الغاز المسال، الميثان) والدخان. يرتفع AOUT مع مستوى الغاز، ويتبدّل DOUT عند عتبة معينة.'],
  uses: [['Gas leak and smoke alarms.', 'إنذارات تسرب الغاز والدخان.'], ['Ventilation control.', 'التحكم بالتهوية.']],
  steps: [MODULE_SUPPLY_STEP, ['AOUT → A0, DOUT → pin 2.', 'AOUT ← A0 و DOUT ← الطرف 2.']],
  tips: [['A real sensor heats up (about 150 mA) and needs a minute to warm up; set the gas level in the Inspector here.', 'الحساس الحقيقي يسخن (نحو 150 ملي أمبير) ويحتاج دقيقة ليستقر؛ هنا اضبط مستوى الغاز من لوحة الخصائص.']],
  pins: { VCC: P_VCC, GND: P_GND, AOUT: ['Analog gas level.', 'مستوى الغاز التماثلي.'], DOUT: ['Digital alarm output (threshold).', 'خرج الإنذار الرقمي (حسب العتبة).'] },
  board: { VCC: V5, GND, AOUT: ['A0', 'GP26'], DOUT: ['D2', 'GP15'] },
};

const FLAME: GuideEntry = {
  ...MQ2,
  ar: 'حساس اللهب',
  what: ['Senses the infrared light of a flame. AOUT rises with the IR level; DOUT switches at a threshold.', 'يتحسس الأشعة تحت الحمراء الصادرة من اللهب. يرتفع AOUT مع مستوى الأشعة، ويتبدّل DOUT عند عتبة معينة.'],
  uses: [['Fire alarms.', 'إنذارات الحريق.'], ['Fire-fighting robots.', 'روبوتات إطفاء الحرائق.']],
  tips: [['Set the IR level in the Inspector while simulating.', 'اضبط مستوى الأشعة من لوحة الخصائص أثناء المحاكاة.']],
  pins: { VCC: P_VCC, GND: P_GND, AOUT: ['Analog IR level.', 'مستوى الأشعة التماثلي.'], DOUT: ['Digital output (threshold).', 'الخرج الرقمي (حسب العتبة).'] },
  board: { VCC, GND, AOUT: ['A0', 'GP26'], DOUT: ['D2', 'GP15'] },
};

const SOUND: GuideEntry = {
  ...FLAME,
  ar: 'حساس الصوت KY-038',
  what: ['A microphone board: AOUT follows the sound level, DOUT switches when it is louder than the threshold.', 'لوحة ميكروفون: يتبع AOUT مستوى الصوت، ويتبدّل DOUT عندما يتجاوز الصوت العتبة.'],
  uses: [['Clap switches.', 'مفاتيح التصفيق.'], ['Noise level indicators.', 'مؤشرات مستوى الضوضاء.']],
  tips: [['Use the Clap control on the part while simulating.', 'استخدم زر التصفيق على القطعة أثناء المحاكاة.']],
  pins: { VCC: P_VCC, GND: P_GND, AOUT: ['Analog sound level.', 'مستوى الصوت التماثلي.'], DOUT: ['Digital output (threshold).', 'الخرج الرقمي (حسب العتبة).'] },
};

const PIR: GuideEntry = {
  ar: 'حساس الحركة PIR',
  what: ['Detects people and animals moving by their body heat (passive infrared). OUT goes HIGH for a while after motion.', 'يكشف حركة الأشخاص والحيوانات من حرارة أجسامهم (الأشعة تحت الحمراء السلبية). يصبح OUT بحالة HIGH لفترة بعد الحركة.'],
  uses: [['Burglar alarms.', 'أجهزة إنذار السرقة.'], ['Lights that switch on when someone enters.', 'إنارة تشتغل عند دخول شخص.']],
  steps: [MODULE_SUPPLY_STEP, ['OUT → pin 2: `if (digitalRead(2) == HIGH) { … }`', 'OUT ← الطرف 2: `if (digitalRead(2) == HIGH) { … }`']],
  tips: [['Click the sensor while simulating to make motion.', 'انقر على الحساس أثناء المحاكاة لمحاكاة حركة.'], ['A real sensor needs about a minute to settle after power-up.', 'الحساس الحقيقي يحتاج نحو دقيقة ليستقر بعد التشغيل.']],
  pins: { VCC: ['Supply, 5 V (4.5–20 V).', 'التغذية، 5 فولت (من 4.5 إلى 20 فولت).'], OUT: ['HIGH (3.3 V) after motion.', 'HIGH (3.3 فولت) بعد الحركة.'], GND: P_GND },
  board: { VCC: V5, OUT: ['D2', 'GP15'], GND },
};

const MPU6050: GuideEntry = {
  ar: 'حساس التسارع والدوران MPU-6050',
  what: ['A 3-axis accelerometer and 3-axis gyroscope on one I2C board (address 0x68). It tells how the board is tilted and how fast it turns.', 'مقياس تسارع بثلاثة محاور وجيروسكوب بثلاثة محاور على لوحة I2C واحدة (العنوان 0x68). يخبرك بميلان اللوحة وسرعة دورانها.'],
  uses: [['Tilt and orientation sensing.', 'تحسس الميلان والاتجاه.'], ['Self-balancing robots and drones.', 'الروبوتات ذاتية التوازن والطائرات المسيّرة.'], ['Gesture and step counters.', 'كشف الإيماءات وعدّ الخطوات.']],
  steps: [
    MODULE_SUPPLY_STEP,
    ['SDA → A4, SCL → A5 on the Uno.', 'SDA ← A4 و SCL ← A5 في Uno.'],
    ['Use the Adafruit_MPU6050 library, or read the registers with Wire.', 'استخدم مكتبة Adafruit_MPU6050 أو اقرأ المسجّلات باستخدام Wire.'],
  ],
  tips: [['AD0 to GND = address 0x68, AD0 to VCC = 0x69.', 'AD0 إلى GND = العنوان 0x68، و AD0 إلى VCC = 0x69.'], ['Tilt it with the pad under the part while simulating.', 'أمِلْه باستخدام اللوحة الصغيرة تحت القطعة أثناء المحاكاة.']],
  pins: {
    VCC: ['Supply, 3.3–5 V (the board has a regulator).', 'التغذية، من 3.3 إلى 5 فولت (اللوحة فيها منظّم).'],
    GND: P_GND,
    SDA: P_SDA,
    SCL: P_SCL,
    INT: ['Interrupt output (not simulated).', 'خرج المقاطعة (غير مُحاكى).'],
    AD0: ['Address select: GND = 0x68, VCC = 0x69.', 'اختيار العنوان: GND = 0x68، و VCC = 0x69.'],
    XCL: ['Auxiliary I2C clock (not simulated).', 'ساعة I2C المساعدة (غير مُحاكاة).'],
    XDA: ['Auxiliary I2C data (not simulated).', 'بيانات I2C المساعدة (غير مُحاكاة).'],
  },
  board: { VCC, GND, ...I2C, INT: NONE, AD0: NONE, XCL: NONE, XDA: NONE },
};

const TILT: GuideEntry = {
  ar: 'وحدة مفتاح الميلان',
  what: ['A small ball switch: OUT changes when the module is tilted.', 'مفتاح كروي صغير: يتغير OUT عند إمالة الوحدة.'],
  uses: [['Tilt and fall alarms.', 'إنذارات الميلان والسقوط.'], ['Anti-theft and orientation switches.', 'مفاتيح مكافحة السرقة وتحديد الاتجاه.']],
  steps: [MODULE_SUPPLY_STEP, ['OUT → pin 2: HIGH while tilted.', 'OUT ← الطرف 2: يكون HIGH أثناء الميلان.']],
  tips: [['Click the part while simulating to tilt it.', 'انقر على القطعة أثناء المحاكاة لإمالتها.']],
  pins: { VCC: P_VCC, GND: P_GND, OUT: ['HIGH while tilted.', 'HIGH أثناء الميلان.'] },
  board: { VCC, GND, OUT: ['D2', 'GP15'] },
};

const HCSR04: GuideEntry = {
  ar: 'حساس المسافة بالموجات فوق الصوتية HC-SR04',
  what: ['Measures distance (2–400 cm) with ultrasound: it sends a ping and times the echo.', 'يقيس المسافة (من 2 إلى 400 سم) بالموجات فوق الصوتية: يرسل نبضة ويقيس زمن عودة الصدى.'],
  uses: [['Obstacle-avoiding robots.', 'الروبوتات التي تتجنب العوائق.'], ['Parking sensors and level meters for tanks.', 'حساسات ركن السيارات ومقاييس مستوى الخزانات.']],
  steps: [
    MODULE_SUPPLY_STEP,
    ['TRIG → 9, ECHO → 10.', 'TRIG ← 9 و ECHO ← 10.'],
    ['Send a 10 µs HIGH pulse on TRIG, then time the ECHO pulse with `pulseIn()`: the distance in cm is the time in µs divided by 58.', 'أرسل نبضة HIGH مدتها 10 ميكروثانية على TRIG، ثم قِس نبضة ECHO باستخدام `pulseIn()`: المسافة بالسنتيمتر هي الزمن بالميكروثانية مقسوماً على 58.'],
  ],
  tips: [
    ['ECHO is a 5 V signal: on a 3.3 V board (Pico) use a divider (1 kΩ and 2 kΩ).', 'ECHO إشارة 5 فولت: مع لوحة 3.3 فولت (Pico) استخدم مقسّم جهد (1 كيلو و 2 كيلو أوم).'],
    ['Drag the obstacle in front of it to change the distance.', 'اسحب العائق أمامه لتغيير المسافة.'],
  ],
  code: `const TRIG = 9, ECHO = 10;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH);
  Serial.print(us / 58.0);
  Serial.println(" cm");
  delay(200);
}`,
  pins: { VCC: ['Supply, 5 V.', 'التغذية، 5 فولت.'], TRIG: ['Trigger input: a 10 µs pulse starts a measurement.', 'دخل الإطلاق: نبضة 10 ميكروثانية تبدأ القياس.'], ECHO: ['Echo output: the pulse width is the travel time.', 'خرج الصدى: عرض النبضة هو زمن الرحلة.'], GND: P_GND },
  board: { VCC: V5, TRIG: ['D9', 'GP14'], ECHO: ['D10', 'GP15'], GND },
};

const IR_RECEIVER: GuideEntry = {
  ar: 'مستقبل الأشعة تحت الحمراء',
  what: ['Receives the 38 kHz infrared light of remote controls and outputs the decoded pulses (DAT is LOW during a burst).', 'يستقبل أشعة الريموت كنترول تحت الحمراء بتردد 38 كيلوهيرتز ويُخرج النبضات بعد فك تضمينها (DAT يكون LOW أثناء الإرسال).'],
  uses: [['Control a project with a TV remote.', 'التحكم بالمشروع بريموت التلفاز.'], ['Read and copy remote codes.', 'قراءة رموز الريموت ونسخها.']],
  steps: [
    ['GND → GND, VCC → 5V, DAT → pin 2.', 'GND ← GND و VCC ← 5V و DAT ← الطرف 2.'],
    ['Use the IRremote library: `IrReceiver.begin(2)` in `setup()`, then `IrReceiver.decode()` in `loop()` (see the example code).', 'استخدم مكتبة IRremote: `IrReceiver.begin(2)` داخل `setup()`، ثم `IrReceiver.decode()` داخل `loop()` (انظر شيفرة المثال).'],
    ['Add an IR Remote to the circuit and click its buttons while simulating.', 'أضف ريموت IR إلى الدائرة وانقر أزراره أثناء المحاكاة.'],
  ],
  code: `#include <IRremote.hpp>

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(2);
}

void loop() {
  if (IrReceiver.decode()) {
    Serial.println(IrReceiver.decodedIRData.command, HEX);
    IrReceiver.resume();
  }
}`,
  pins: { GND: P_GND, VCC: ['Supply, 2.7–5.5 V.', 'التغذية، من 2.7 إلى 5.5 فولت.'], DAT: ['Demodulated data (LOW during a burst).', 'البيانات بعد فك التضمين (LOW أثناء الإرسال).'] },
  board: { GND, VCC, DAT: ['D2', 'GP15'] },
};

const IR_REMOTE: GuideEntry = {
  ar: 'ريموت كنترول بالأشعة تحت الحمراء',
  what: ['A remote control. Each button sends an NEC code by infrared to every IR receiver in the circuit.', 'جهاز تحكم عن بُعد. كل زر يرسل رمز NEC بالأشعة تحت الحمراء إلى كل مستقبل IR في الدائرة.'],
  uses: [['Wireless control of projects.', 'التحكم اللاسلكي بالمشاريع.']],
  steps: [
    ['Place it anywhere on the canvas: it needs no wires.', 'ضعه في أي مكان على لوحة الرسم: لا يحتاج أسلاكاً.'],
    ['Add an IR Receiver connected to the board.', 'أضف مستقبل IR موصولاً باللوحة.'],
    ['Click its buttons while simulating; print the command to learn the codes (POWER = 0xA2).', 'انقر أزراره أثناء المحاكاة؛ واطبع الأمر لتتعرف على الرموز (POWER = 0xA2).'],
  ],
  board: null,
};

const DS1307: GuideEntry = {
  ar: 'وحدة ساعة الوقت الحقيقي DS1307',
  what: ['A real-time clock on I2C (address 0x68). It keeps the date and time, even with the board off thanks to its coin cell.', 'ساعة وقت حقيقي على I2C (العنوان 0x68). تحفظ التاريخ والوقت حتى مع إطفاء اللوحة بفضل بطاريتها الصغيرة.'],
  uses: [['Clocks and timers that run on a schedule.', 'الساعات والمؤقتات التي تعمل حسب جدول.'], ['Time stamps for data logging.', 'طوابع زمنية لتسجيل البيانات.']],
  steps: [
    ['GND → GND, 5V → 5V.', 'GND ← GND و 5V ← 5V.'],
    ['SDA → A4, SCL → A5 on the Uno.', 'SDA ← A4 و SCL ← A5 في Uno.'],
  ],
  code: `#include <RTClib.h>
RTC_DS1307 rtc;

void setup() {
  Serial.begin(9600);
  rtc.begin();
}

void loop() {
  DateTime now = rtc.now();
  Serial.print(now.hour());
  Serial.print(':');
  Serial.println(now.minute());
  delay(1000);
}`,
  tips: [['Set the clock once with `rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));`', 'اضبط الساعة مرة واحدة باستخدام `rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));`'], ['SQW is not simulated.', 'الطرف SQW غير مُحاكى.']],
  pins: { GND: P_GND, '5V': ['Supply, 5 V.', 'التغذية، 5 فولت.'], SDA: P_SDA, SCL: P_SCL, SQW: ['Square-wave output (not simulated).', 'خرج الموجة المربعة (غير مُحاكى).'] },
  board: { GND, '5V': V5, ...I2C, SQW: NONE },
};

// ---------------------------------------------------------------- motors

const SERVO: GuideEntry = {
  ar: 'محرك سيرفو SG90',
  what: ['A small motor that turns to an angle between 0° and 180°, set by the width of a pulse sent every 20 ms.', 'محرك صغير يدور إلى زاوية بين 0° و 180°، يحددها عرض نبضة تُرسل كل 20 ملي ثانية.'],
  uses: [['Robot arms, grippers and steering.', 'أذرع الروبوت والقابضات والتوجيه.'], ['Locks, flaps and moving pointers.', 'الأقفال والبوابات الصغيرة والمؤشرات المتحركة.']],
  steps: [
    ['Brown (GND) → GND, red (V+) → 5V, orange (PWM) → pin 9.', 'البني (GND) ← GND، والأحمر (V+) ← 5V، والبرتقالي (PWM) ← الطرف 9.'],
  ],
  code: `#include <Servo.h>
Servo servo;

void setup() { servo.attach(9); }

void loop() {
  servo.write(0);
  delay(1000);
  servo.write(180);
  delay(1000);
}`,
  tips: [['Several or loaded servos need their own 5 V supply (with a common GND); the board can reset when they start.', 'عدة محركات سيرفو أو محرك محمّل تحتاج مصدر 5 فولت خاصاً (مع أرضي مشترك)؛ قد تُعاد تهيئة اللوحة عند انطلاقها.']],
  pins: { GND: ['Ground (brown).', 'الأرضي (البني).'], 'V+': ['Supply, 5 V (red).', 'التغذية، 5 فولت (الأحمر).'], PWM: ['Control pulses (orange).', 'نبضات التحكم (البرتقالي).'] },
  board: { GND, 'V+': V5, PWM: ['D9', 'GP15'] },
};

const STEPPER: GuideEntry = {
  ar: 'محرك خطوي ثنائي القطب NEMA 17',
  what: ['A motor that moves in precise steps: 200 per turn (1.8° each). It has two coils, A and B.', 'محرك يتحرك بخطوات دقيقة: 200 خطوة في الدورة (1.8° لكل خطوة). فيه ملفان A و B.'],
  uses: [['3D printers and CNC machines.', 'الطابعات ثلاثية الأبعاد وآلات CNC.'], ['Camera sliders and precise positioning.', 'منزلقات الكاميرا والتموضع الدقيق.']],
  steps: [
    ['Never connect the coils to the board directly.', 'لا توصل الملفات باللوحة مباشرةً أبداً.'],
    ['Coil A (A+, A−) and coil B (B+, B−) to a driver: A4988 (1A/1B and 2A/2B) or L298N (OUT1–OUT4).', 'الملف A (A+ و A−) والملف B (B+ و B−) إلى مشغّل: A4988 (1A/1B و 2A/2B) أو L298N (OUT1–OUT4).'],
    ['Drive the driver from the board (STEP/DIR or IN1–IN4).', 'تحكّم بالمشغّل من اللوحة (STEP/DIR أو IN1–IN4).'],
  ],
  pins: { 'A+': ['Coil A, +.', 'الملف A، الطرف +.'], 'A-': ['Coil A, −.', 'الملف A، الطرف −.'], 'B+': ['Coil B, +.', 'الملف B، الطرف +.'], 'B-': ['Coil B, −.', 'الملف B، الطرف −.'] },
  board: null,
};

const DC_MOTOR: GuideEntry = {
  ar: 'محرك تيار مستمر',
  what: ['A motor that turns continuously. Its speed follows the voltage and its direction follows the polarity.', 'محرك يدور باستمرار. سرعته تتبع الجهد واتجاهه يتبع القطبية.'],
  uses: [['Wheels, fans and pumps.', 'العجلات والمراوح والمضخات.'], ['Toys and small machines.', 'الألعاب والآلات الصغيرة.']],
  steps: [
    ['Never connect it to an I/O pin directly.', 'لا توصله بطرف إدخال/إخراج مباشرةً أبداً.'],
    ['One direction: switch it with an N-MOSFET or NPN transistor, with a flyback diode across the motor.', 'لاتجاه واحد: شغّله بترانزستور MOSFET قناة N أو NPN، مع ثنائي حماية على المحرك.'],
    ['Both directions: use an H-bridge such as the L298N.', 'للاتجاهين: استخدم جسر H مثل L298N.'],
    ['PWM (analogWrite) on the gate or the enable pin sets the speed.', 'الـ PWM (analogWrite) على البوابة أو طرف التمكين يحدد السرعة.'],
  ],
  pins: { '+': ['Terminal +.', 'الطرف +.'], '-': ['Terminal −.', 'الطرف −.'] },
  board: null,
};

const STEPPER_28BYJ: GuideEntry = {
  ar: 'محرك خطوي 28BYJ-48 مع ULN2003',
  what: ['A small geared stepper motor (2048 steps per turn) on its ULN2003 driver board.', 'محرك خطوي صغير بمسننات (2048 خطوة في الدورة) مع لوحة المشغّل ULN2003.'],
  uses: [['Slow, precise movements: dials, blinds, turntables.', 'الحركات البطيئة الدقيقة: المؤشرات، الستائر، المنصات الدوارة.']],
  steps: [
    ['+ → 5V, − → GND.', '+ ← 5V و − ← GND.'],
    ['IN1–IN4 → pins 8–11.', 'IN1–IN4 ← الأطراف 8–11.'],
  ],
  code: `#include <Stepper.h>
Stepper motor(2048, 8, 10, 9, 11); // note the order IN1, IN3, IN2, IN4

void setup() { motor.setSpeed(10); }

void loop() {
  motor.step(2048);   // one turn
  delay(500);
  motor.step(-2048);  // and back
  delay(500);
}`,
  tips: [['Note the pin order 8, 10, 9, 11 in the Stepper library.', 'لاحظ ترتيب الأطراف 8، 10، 9، 11 في مكتبة Stepper.'], ['It is slow: about 15 RPM at most.', 'إنه بطيء: نحو 15 دورة في الدقيقة كحد أقصى.']],
  pins: {
    IN1: ['Coil A on when HIGH.', 'يشغّل الملف A عند HIGH.'],
    IN2: ['Coil B on when HIGH.', 'يشغّل الملف B عند HIGH.'],
    IN3: ['Coil C on when HIGH.', 'يشغّل الملف C عند HIGH.'],
    IN4: ['Coil D on when HIGH.', 'يشغّل الملف D عند HIGH.'],
    '+': ['Motor supply, 5 V.', 'تغذية المحرك، 5 فولت.'],
    '-': ['Ground.', 'الأرضي.'],
  },
  board: { IN1: ['D8', 'GP2'], IN2: ['D9', 'GP3'], IN3: ['D10', 'GP4'], IN4: ['D11', 'GP5'], '+': V5, '-': GND },
};

const A4988: GuideEntry = {
  ar: 'مشغّل المحرك الخطوي A4988',
  what: ['A stepper driver: each rising edge on STEP moves the motor one (micro)step in the direction set by DIR.', 'مشغّل محرك خطوي: كل حافة صاعدة على STEP تحرك المحرك خطوة (أو جزء خطوة) بالاتجاه الذي يحدده DIR.'],
  uses: [['Drive NEMA 17 steppers with two board pins.', 'قيادة محركات NEMA 17 بطرفين فقط من اللوحة.'], ['Smooth motion with microsteps (up to 1/16).', 'حركة ناعمة بالخطوات الجزئية (حتى 1/16).']],
  steps: [
    ['VMOT → motor supply (8–35 V) with a 100 µF capacitor; its GND → supply −.', 'VMOT ← تغذية المحرك (8–35 فولت) مع متسعة 100 ميكروفاراد؛ و GND الخاص به ← سالب التغذية.'],
    ['VDD → 5V and the second GND → board GND.', 'VDD ← 5V و GND الثاني ← أرضي اللوحة.'],
    ['1A/1B → coil A, 2A/2B → coil B.', '1A/1B ← الملف A، و 2A/2B ← الملف B.'],
    ['STEP → 3, DIR → 4; tie RST to SLP; EN → GND (enabled).', 'STEP ← 3 و DIR ← 4؛ اربط RST بـ SLP؛ و EN ← GND (مفعّل).'],
  ],
  tips: [['On a real module set the current limit (small potentiometer) before connecting the motor.', 'في الوحدة الحقيقية اضبط حد التيار (المقاومة المتغيرة الصغيرة) قبل توصيل المحرك.'], ['MS1–MS3 all LOW = full steps; all HIGH = 1/16 steps.', 'MS1–MS3 كلها LOW = خطوات كاملة؛ كلها HIGH = خطوات 1/16.']],
  pins: {
    EN: ['Enable, active LOW.', 'التمكين، فعّال عند LOW.'],
    MS1: ['Microstep select 1.', 'اختيار الخطوة الجزئية 1.'],
    MS2: ['Microstep select 2.', 'اختيار الخطوة الجزئية 2.'],
    MS3: ['Microstep select 3.', 'اختيار الخطوة الجزئية 3.'],
    RST: ['Reset, active LOW: tie to SLP.', 'إعادة الضبط، فعّال عند LOW: اربطه بـ SLP.'],
    SLP: ['Sleep, active LOW: tie to RST.', 'السكون، فعّال عند LOW: اربطه بـ RST.'],
    STEP: ['One step per rising edge.', 'خطوة واحدة لكل حافة صاعدة.'],
    DIR: ['Direction.', 'الاتجاه.'],
    VMOT: ['Motor supply, 8–35 V.', 'تغذية المحرك، من 8 إلى 35 فولت.'],
    GND: P_GND,
    VDD: ['Logic supply, 3.3–5 V.', 'تغذية المنطق، من 3.3 إلى 5 فولت.'],
    '1A': ['Coil A.', 'الملف A.'],
    '1B': ['Coil A.', 'الملف A.'],
    '2A': ['Coil B.', 'الملف B.'],
    '2B': ['Coil B.', 'الملف B.'],
  },
  board: { STEP: ['D3', 'GP15'], DIR: ['D4', 'GP14'], EN: GND, VDD: VCC, GND },
};

const L298N: GuideEntry = {
  ar: 'مشغّل المحركات L298N',
  what: ['A dual H-bridge: it drives two DC motors forwards and backwards (or one stepper) from a separate motor supply.', 'جسر H مزدوج: يشغّل محركي تيار مستمر للأمام والخلف (أو محركاً خطوياً واحداً) من مصدر تغذية منفصل للمحركات.'],
  uses: [['Two-wheel robot cars.', 'سيارات الروبوت ذات العجلتين.'], ['Pumps, fans and steppers.', 'المضخات والمراوح والمحركات الخطوية.']],
  steps: [
    ['+12V → motor supply (e.g. 7–12 V battery); GND → supply − and the board GND.', '+12V ← تغذية المحركات (مثلاً بطارية 7–12 فولت)؛ و GND ← سالب التغذية وأرضي اللوحة.'],
    ['Motor A → OUT1/OUT2, motor B → OUT3/OUT4.', 'المحرك A ← OUT1/OUT2، والمحرك B ← OUT3/OUT4.'],
    ['IN1/IN2 → 8/7 for the direction, ENA → 9 (PWM) for the speed; IN3/IN4 and ENB likewise.', 'IN1/IN2 ← 8/7 للاتجاه، و ENA ← 9 (PWM) للسرعة؛ و IN3/IN4 و ENB بالطريقة نفسها.'],
    ['IN1 HIGH + IN2 LOW = forwards, the opposite = backwards, both equal = stop.', 'IN1 HIGH مع IN2 LOW = للأمام، والعكس = للخلف، وتساويهما = توقف.'],
  ],
  tips: [['Left unconnected, ENA/ENB act as the fitted jumper: full speed.', 'إذا تُرك ENA/ENB بدون توصيل يعملان كالجسر المركّب: سرعة كاملة.'], ['+5V gives 5 V when the motor supply is above about 7 V.', 'يعطي +5V جهد 5 فولت عندما تكون تغذية المحرك أعلى من 7 فولت تقريباً.']],
  code: `const ENA = 9, IN1 = 8, IN2 = 7;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  digitalWrite(IN1, HIGH);   // forwards
  digitalWrite(IN2, LOW);
  analogWrite(ENA, 180);     // about 70 % speed
  delay(2000);
  analogWrite(ENA, 0);       // stop
  delay(1000);
}`,
  pins: {
    '12V': ['Motor supply input.', 'دخل تغذية المحركات.'],
    GND: P_GND,
    '5V': ['5 V from the on-board regulator.', '5 فولت من المنظّم المدمج.'],
    ENA: ['Enable / PWM speed, motor A.', 'التمكين / سرعة PWM للمحرك A.'],
    ENB: ['Enable / PWM speed, motor B.', 'التمكين / سرعة PWM للمحرك B.'],
    IN1: ['Direction input 1 (motor A).', 'دخل الاتجاه 1 (المحرك A).'],
    IN2: ['Direction input 2 (motor A).', 'دخل الاتجاه 2 (المحرك A).'],
    IN3: ['Direction input 3 (motor B).', 'دخل الاتجاه 3 (المحرك B).'],
    IN4: ['Direction input 4 (motor B).', 'دخل الاتجاه 4 (المحرك B).'],
    OUT1: ['Motor A.', 'المحرك A.'],
    OUT2: ['Motor A.', 'المحرك A.'],
    OUT3: ['Motor B.', 'المحرك B.'],
    OUT4: ['Motor B.', 'المحرك B.'],
  },
  board: { GND, ENA: ['D9', 'GP15'], IN1: ['D8', 'GP14'], IN2: ['D7', 'GP13'], IN3: ['D5', 'GP12'], IN4: ['D4', 'GP11'], ENB: ['D10', 'GP10'] },
};

// ---------------------------------------------------------------- relays

const RELAY: GuideEntry = {
  ar: 'مرحّل (ريلاي) KS2E',
  what: ['An electrically operated switch: current in the coil pulls the contacts over. This one has two sets of changeover contacts (DPDT).', 'مفتاح يعمل بالكهرباء: التيار في الملف يسحب نقاط التلامس. هذا النوع فيه مجموعتان من نقاط التبديل (DPDT).'],
  uses: [['Switch lamps, pumps and other circuits, isolated from the board.', 'تشغيل المصابيح والمضخات ودوائر أخرى معزولة عن اللوحة.'], ['Reverse a motor (two changeover contacts).', 'عكس اتجاه محرك (بنقطتي تبديل).']],
  steps: [
    ['COIL1 → +5V; COIL2 → the collector of an NPN transistor (emitter → GND, base → pin through 1 kΩ).', 'COIL1 ← +5V؛ و COIL2 ← مجمّع ترانزستور NPN (الباعث ← GND، والقاعدة ← الطرف عبر 1 كيلو أوم).'],
    ['A flyback diode across the coil: cathode to +5V.', 'ثنائي حماية على الملف: المهبط إلى +5V.'],
    ['P1/P2 are the common contacts: joined to NC at rest and to NO while energised.', 'P1/P2 هما نقطتا التلامس المشتركتان: متصلتان بـ NC في السكون وبـ NO عند التشغيل.'],
  ],
  tips: [['The coil needs about 40 mA: more than an I/O pin should give.', 'يحتاج الملف نحو 40 ملي أمبير: أكثر مما يجب أن يعطيه طرف الإدخال/الإخراج.']],
  pins: {
    COIL1: ['Coil (+5 V side).', 'الملف (جهة +5 فولت).'],
    COIL2: ['Coil (switched to GND).', 'الملف (الجهة التي تُوصل بالأرضي).'],
    P1: ['Common contact 1.', 'نقطة التلامس المشتركة 1.'],
    NC1: ['Normally closed 1: joined to P1 at rest.', 'مغلق عادةً 1: متصل بـ P1 في السكون.'],
    NO1: ['Normally open 1: joined to P1 while energised.', 'مفتوح عادةً 1: يتصل بـ P1 عند التشغيل.'],
    P2: ['Common contact 2.', 'نقطة التلامس المشتركة 2.'],
    NC2: ['Normally closed 2.', 'مغلق عادةً 2.'],
    NO2: ['Normally open 2.', 'مفتوح عادةً 2.'],
  },
  board: { COIL1: V5 },
};

const RELAY_MODULE: GuideEntry = {
  ar: 'وحدة مرحّل (ريلاي) بقناة واحدة',
  what: ['A relay with its transistor, diode and optocoupler on one board: a board pin switches it directly.', 'مرحّل مع الترانزستور والثنائي والعازل الضوئي على لوحة واحدة: يشغّله طرف من اللوحة مباشرةً.'],
  uses: [['Switch lamps, pumps, fans and heaters.', 'تشغيل المصابيح والمضخات والمراوح والسخانات.'], ['Home automation.', 'أتمتة المنازل.']],
  steps: [
    ['VCC → 5V, GND → GND, IN → pin 7.', 'VCC ← 5V و GND ← GND و IN ← الطرف 7.'],
    ['Load circuit: supply → COM, NO → load. NO is closed while the relay is on; NC is closed at rest.', 'دائرة الحمل: التغذية ← COM، و NO ← الحمل. يُغلق NO أثناء تشغيل المرحّل، ويُغلق NC في السكون.'],
    ['Most modules switch on when IN is LOW (the trigger setting in the Inspector).', 'معظم الوحدات تعمل عندما يكون IN بحالة LOW (إعداد التفعيل في لوحة الخصائص).'],
  ],
  tips: [['Never work on mains wiring while it is powered. In a lab, use low voltages.', 'لا تعمل أبداً على أسلاك الكهرباء الرئيسية وهي موصولة. في المختبر استخدم جهوداً منخفضة.']],
  code: `const RELAY = 7;

void setup() {
  pinMode(RELAY, OUTPUT);
  digitalWrite(RELAY, HIGH);  // off (active-LOW module)
}

void loop() {
  digitalWrite(RELAY, LOW);   // on
  delay(2000);
  digitalWrite(RELAY, HIGH);  // off
  delay(2000);
}`,
  pins: {
    IN: ['Control input from a board pin.', 'دخل التحكم من طرف اللوحة.'],
    GND: P_GND,
    VCC: P_VCC,
    COM: ['Common contact.', 'نقطة التلامس المشتركة.'],
    NO: ['Normally open: joined to COM while on.', 'مفتوح عادةً: يتصل بـ COM أثناء التشغيل.'],
    NC: ['Normally closed: joined to COM while off.', 'مغلق عادةً: متصل بـ COM أثناء الإطفاء.'],
  },
  board: { IN: ['D7', 'GP15'], GND, VCC: V5, COM: NONE, NO: NONE, NC: NONE },
};

const SIGNAL_GENERATOR: GuideEntry = {
  ar: 'مولّد إشارات',
  what: ['A bench instrument that outputs a square, sine or triangle wave with adjustable frequency, amplitude and offset.', 'جهاز مختبري يُخرج موجة مربعة أو جيبية أو مثلثية بتردد وسعة وإزاحة قابلة للضبط.'],
  uses: [['Test filters, inputs and logic circuits.', 'اختبار المرشحات والمداخل والدوائر المنطقية.'], ['A clock signal for counters and flip-flops.', 'إشارة ساعة للعدّادات والقلابات.']],
  steps: [
    ['GND → the circuit ground.', 'GND ← أرضي الدائرة.'],
    ['OUT → the input under test (through a resistor when it feeds a pin).', 'OUT ← المدخل المراد اختباره (عبر مقاومة إذا كان يغذّي طرفاً).'],
    ['Watch it with the oscilloscope.', 'راقبه براسم الإشارات.'],
  ],
  tips: [['Keep the output between 0 and 5 V (amplitude and offset) when it feeds a board pin.', 'أبقِ الخرج بين 0 و 5 فولت (السعة والإزاحة) عندما يغذّي طرفاً في اللوحة.']],
  pins: { OUT: ['Signal output (50 Ω).', 'خرج الإشارة (50 أوم).'], GND: P_GND },
  board: { GND, OUT: ['A0', 'GP26'] },
};

export const MODULES: Record<string, GuideEntry> = {
  ...GATES,
  'evlab.74hc595': SHIFT_595,
  'evlab.uln2003': ULN2003,
  'evlab.dht22': DHT22,
  'evlab.dht11': DHT11,
  'evlab.ntc-module': NTC_MODULE,
  'evlab.ldr-module': LDR_MODULE,
  'evlab.mq2': MQ2,
  'evlab.flame-sensor': FLAME,
  'evlab.sound-sensor': SOUND,
  'evlab.pir': PIR,
  'evlab.mpu6050': MPU6050,
  'evlab.tilt-switch': TILT,
  'evlab.hc-sr04': HCSR04,
  'evlab.ir-receiver': IR_RECEIVER,
  'evlab.ir-remote': IR_REMOTE,
  'evlab.ds1307': DS1307,
  'evlab.servo': SERVO,
  'evlab.stepper': STEPPER,
  'evlab.dc-motor': DC_MOTOR,
  'evlab.28byj48': STEPPER_28BYJ,
  'evlab.a4988': A4988,
  'evlab.l298n': L298N,
  'evlab.relay-ks2e': RELAY,
  'evlab.relay-module': RELAY_MODULE,
  'evlab.signal-generator': SIGNAL_GENERATOR,
};

