/** Guide content: simulated LEDs, displays, buttons, switches and other controls. */
import type { BoardPins, GuideEntry, L } from './types';

const GND: BoardPins = ['GND', 'GND'];
const V5: BoardPins = ['5V', 'VBUS'];
const VCC: BoardPins = ['5V', '3V3'];

// ---------------------------------------------------------------- LEDs

const LED: GuideEntry = {
  ar: 'ثنائي باعث للضوء (LED)',
  what: ['A light-emitting diode: it lights up when current flows from the anode (+, long leg) to the cathode (−, short leg).', 'ثنائي باعث للضوء: يضيء عندما يمر التيار من المصعد (+، الرِّجل الطويلة) إلى المهبط (−، الرِّجل القصيرة).'],
  uses: [
    ['Indicator and status lights.', 'مصابيح البيان والحالة.'],
    ['Signals and simple displays (traffic lights, counters).', 'الإشارات والعروض البسيطة (إشارة مرور، عدّادات).'],
    ['Dimmed with PWM (analogWrite).', 'التحكم بالسطوع عبر PWM (analogWrite).'],
  ],
  steps: [
    ['Connect the anode (A, long leg) through a 220 Ω resistor to an output pin.', 'صِل المصعد (A، الرِّجل الطويلة) عبر مقاومة 220 أوم بطرف إخراج.'],
    ['Connect the cathode (C, short leg) to GND.', 'صِل المهبط (C، الرِّجل القصيرة) بـ GND.'],
    ['In the sketch: `pinMode(13, OUTPUT); digitalWrite(13, HIGH);`', 'في البرنامج: `pinMode(13, OUTPUT); digitalWrite(13, HIGH);`'],
  ],
  tips: [
    ['Never connect an LED without a resistor: too much current destroys it, and can damage the pin.', 'لا توصل الـ LED أبداً بدون مقاومة: التيار الزائد يُتلفه وقد يُتلف الطرف.'],
    ['Connected backwards, it simply stays dark.', 'إذا وُصل معكوساً يبقى مطفأً فقط.'],
    ['`analogWrite()` on a PWM pin (~) dims it.', 'استخدم `analogWrite()` على طرف PWM (~) للتعتيم.'],
  ],
  code: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);  // on
  delay(500);
  digitalWrite(13, LOW);   // off
  delay(500);
}`,
  pins: {
    A: ['Anode (+), the longer leg: towards the pin, through the resistor.', 'المصعد (+)، الرِّجل الأطول: باتجاه الطرف عبر المقاومة.'],
    C: ['Cathode (−), the shorter leg: to GND.', 'المهبط (−)، الرِّجل الأقصر: إلى GND.'],
  },
  board: { A: ['D13 → 220 Ω', 'GP15 → 220 Ω'], C: GND },
};

const RGB_LED: GuideEntry = {
  ar: 'LED ثلاثي الألوان (RGB)',
  what: ['Red, green and blue LEDs in one package that share one leg (common cathode or common anode). Mixing them gives any colour.', 'ثلاثة LED أحمر وأخضر وأزرق في غلاف واحد تشترك في رِجل واحدة (مهبط مشترك أو مصعد مشترك). مزجها يعطي أي لون.'],
  uses: [['Colour status lights and mood lighting.', 'مصابيح حالة ملونة وإنارة جمالية.'], ['Learn PWM colour mixing.', 'تعلّم مزج الألوان بالـ PWM.']],
  steps: [
    ['Common cathode: COM to GND (common anode: COM to 5V; set it in the Inspector).', 'مهبط مشترك: COM إلى GND (مصعد مشترك: COM إلى 5V؛ اضبطه في لوحة الخصائص).'],
    ['R, G and B each through its own 220 Ω resistor to a PWM pin (9, 10, 11).', 'كل من R و G و B عبر مقاومة 220 أوم خاصة به إلى طرف PWM (9، 10، 11).'],
    ['`analogWrite(9, 255); analogWrite(10, 128); analogWrite(11, 0);` gives orange.', '`analogWrite(9, 255); analogWrite(10, 128); analogWrite(11, 0);` يعطي اللون البرتقالي.'],
  ],
  tips: [['With a common anode the logic is inverted: 255 = off, 0 = full brightness.', 'مع المصعد المشترك ينعكس المنطق: 255 = مطفأ، 0 = أقصى سطوع.']],
  pins: {
    R: ['Red LED (through 220 Ω to a PWM pin).', 'الـ LED الأحمر (عبر 220 أوم إلى طرف PWM).'],
    G: ['Green LED (through 220 Ω to a PWM pin).', 'الـ LED الأخضر (عبر 220 أوم إلى طرف PWM).'],
    B: ['Blue LED (through 220 Ω to a PWM pin).', 'الـ LED الأزرق (عبر 220 أوم إلى طرف PWM).'],
    COM: ['Common leg: GND (common cathode) or 5V (common anode).', 'الرِّجل المشتركة: GND (مهبط مشترك) أو 5V (مصعد مشترك).'],
  },
  board: { R: ['D9 → 220 Ω', 'GP13 → 220 Ω'], G: ['D10 → 220 Ω', 'GP14 → 220 Ω'], B: ['D11 → 220 Ω', 'GP15 → 220 Ω'], COM: GND },
};

const SEGMENTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];

const SEVEN_SEGMENT: GuideEntry = {
  ar: 'شاشة سباعية المقاطع',
  what: ['Eight LEDs (segments A–G and the decimal point DP) arranged to show one digit.', 'ثمانية LED (المقاطع A–G والفاصلة العشرية DP) مرتبة لعرض رقم واحد.'],
  uses: [['Counters, timers and clocks.', 'العدّادات والمؤقتات والساعات.'], ['Scoreboards and simple readouts.', 'لوحات النتائج والقراءات البسيطة.']],
  steps: [
    ['Common cathode: COM to GND (common anode: COM to 5V).', 'مهبط مشترك: COM إلى GND (مصعد مشترك: COM إلى 5V).'],
    ['Each segment A–G and DP through its own 220 Ω resistor to an output pin.', 'كل مقطع من A–G و DP عبر مقاومة 220 أوم خاصة به إلى طرف إخراج.'],
    ['Light the segments that form the digit: 1 = B and C, 7 = A, B and C.', 'أضئ المقاطع التي تكوّن الرقم: 1 = B و C، و 7 = A و B و C.'],
  ],
  tips: [
    ['Use one resistor per segment, not one on COM, or the brightness changes with the digit.', 'استخدم مقاومة لكل مقطع وليس مقاومة واحدة على COM، وإلا يتغير السطوع حسب الرقم.'],
    ['A 74HC595 shift register saves pins.', 'سجل الإزاحة 74HC595 يوفّر الأطراف.'],
  ],
  pins: {
    COM: ['Common: GND (common cathode) or 5V (common anode).', 'المشترك: GND (مهبط مشترك) أو 5V (مصعد مشترك).'],
    ...Object.fromEntries(SEGMENTS.map((s): [string, L] => [s, s === 'DP' ? ['Decimal point.', 'الفاصلة العشرية.'] : [`Segment ${s}.`, `المقطع ${s}.`]])),
  },
  board: { COM: GND, ...Object.fromEntries(SEGMENTS.map((s, i): [string, BoardPins] => [s, [`D${i + 2} → 220 Ω`, `GP${i + 2} → 220 Ω`]])) },
};

const BAR_GRAPH: GuideEntry = {
  ar: 'شريط LED بعشرة مقاطع',
  what: ['Ten separate LEDs in one block, side by side. Each has its own anode (A1–A10) and cathode (C1–C10).', 'عشرة LED منفصلة في قالب واحد متجاورة. لكل منها مصعد (A1–A10) ومهبط (C1–C10) خاص به.'],
  uses: [['Level meters (volume, battery, sensor value).', 'مقاييس المستوى (الصوت، البطارية، قيمة حساس).'], ['Running-light effects.', 'تأثيرات الضوء المتحرك.']],
  steps: [
    ['Each anode A1–A10 through a 220 Ω resistor to an output pin.', 'كل مصعد من A1–A10 عبر مقاومة 220 أوم إلى طرف إخراج.'],
    ['All cathodes C1–C10 to GND.', 'كل المهابط من C1–C10 إلى GND.'],
    ['Map a reading to a count: `n = map(analogRead(A0), 0, 1023, 0, 10)` and light the first n.', 'حوّل القراءة إلى عدد: `n = map(analogRead(A0), 0, 1023, 0, 10)` وأضئ أول n منها.'],
  ],
  pins: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => i + 1).flatMap((n): [string, L][] => [
      [`A${n}`, [`Anode of LED ${n}.`, `مصعد الـ LED رقم ${n}.`]],
      [`C${n}`, [`Cathode of LED ${n}: to GND.`, `مهبط الـ LED رقم ${n}: إلى GND.`]],
    ]),
  ),
  board: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => i + 1).flatMap((n): [string, BoardPins][] => [
      [`A${n}`, [`D${n + 1} → 220 Ω`, `GP${n + 1} → 220 Ω`]],
      [`C${n}`, GND],
    ]),
  ),
};

const NEOPIXEL_STEPS: L[] = [
  ['VCC (VDD) to 5V and GND (VSS) to GND.', 'الطرف VCC (VDD) إلى 5V والطرف GND (VSS) إلى GND.'],
  ['DIN to an output pin (a 330 Ω series resistor is recommended).', 'الطرف DIN إلى طرف إخراج (يُنصح بمقاومة 330 أوم على التوالي).'],
  ['Use the Adafruit_NeoPixel or FastLED library: set the colours, then call `strip.show()`.', 'استخدم مكتبة Adafruit_NeoPixel أو FastLED: اضبط الألوان ثم استدعِ `strip.show()`.'],
];

const NEOPIXEL_TIPS: L[] = [
  ['Each pixel draws up to 60 mA at full white: power many pixels from a separate 5 V supply with a common GND.', 'يسحب كل بكسل حتى 60 ملي أمبير باللون الأبيض الكامل: غذِّ الأعداد الكبيرة من مصدر 5 فولت منفصل مع أرضي مشترك.'],
  ['Nothing changes until `show()` is called.', 'لا يتغير شيء حتى تُستدعى `show()`.'],
];

const NEOPIXEL_PINS: Record<string, L> = {
  VCC: ['5 V supply.', 'تغذية 5 فولت.'],
  VDD: ['5 V supply.', 'تغذية 5 فولت.'],
  GND: ['Ground.', 'الأرضي.'],
  VSS: ['Ground.', 'الأرضي.'],
  DIN: ['Data in from the board.', 'دخل البيانات من اللوحة.'],
  DOUT: ['Data out to the next pixel (chaining is not simulated).', 'خرج البيانات إلى البكسل التالي (التسلسل غير مُحاكى).'],
};

const NEOPIXEL: GuideEntry = {
  ar: 'LED قابل للعنونة (NeoPixel)',
  what: ['An RGB LED with a built-in controller (WS2812B). Many can be chained, and each can be set to any colour through a single data pin.', 'LED ملون فيه متحكم مدمج (WS2812B). يمكن ربط عدد كبير منها على التسلسل وضبط لون كل واحد عبر طرف بيانات واحد.'],
  code: `#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel strip(16, 6, NEO_GRB + NEO_KHZ800);  // count, pin

void setup() { strip.begin(); }

void loop() {
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, strip.Color(0, 80, 255));
    strip.show();
    delay(50);
  }
  strip.clear();
}`,
  uses: [['Lighting effects and decorations.', 'تأثيرات الإنارة والزينة.'], ['Colour status indicators.', 'مؤشرات حالة ملونة.']],
  steps: NEOPIXEL_STEPS,
  tips: NEOPIXEL_TIPS,
  pins: { VDD: NEOPIXEL_PINS.VDD, VSS: NEOPIXEL_PINS.VSS, DIN: NEOPIXEL_PINS.DIN, DOUT: NEOPIXEL_PINS.DOUT },
  board: { VDD: V5, VSS: GND, DIN: ['D6', 'GP15'], DOUT: ['', ''] },
};

const NEOPIXEL_GROUP: GuideEntry = {
  ...NEOPIXEL,
  pins: { VCC: NEOPIXEL_PINS.VCC, GND: NEOPIXEL_PINS.GND, DIN: NEOPIXEL_PINS.DIN, DOUT: NEOPIXEL_PINS.DOUT },
  board: { VCC: V5, GND, DIN: ['D6', 'GP15'], DOUT: ['', ''] },
};

// ---------------------------------------------------------------- displays

const LCD_PINS: Record<string, L> = {
  VSS: ['Ground.', 'الأرضي.'],
  VDD: ['5 V supply.', 'تغذية 5 فولت.'],
  V0: ['Contrast: wiper of a 10 kΩ potentiometer (or GND).', 'التباين: ماسحة مقاومة متغيرة 10 كيلو أوم (أو GND).'],
  RS: ['Register select: LOW = command, HIGH = character.', 'اختيار المسجّل: LOW = أمر، HIGH = حرف.'],
  RW: ['Read/write: tie to GND (write only).', 'قراءة/كتابة: صِله بـ GND (كتابة فقط).'],
  E: ['Enable: a pulse here latches the data.', 'التمكين: نبضة هنا تُثبّت البيانات.'],
  D0: ['Data bit 0 (unused in 4-bit mode).', 'بت البيانات 0 (غير مستخدم في وضع 4 بت).'],
  D1: ['Data bit 1 (unused in 4-bit mode).', 'بت البيانات 1 (غير مستخدم في وضع 4 بت).'],
  D2: ['Data bit 2 (unused in 4-bit mode).', 'بت البيانات 2 (غير مستخدم في وضع 4 بت).'],
  D3: ['Data bit 3 (unused in 4-bit mode).', 'بت البيانات 3 (غير مستخدم في وضع 4 بت).'],
  D4: ['Data bit 4.', 'بت البيانات 4.'],
  D5: ['Data bit 5.', 'بت البيانات 5.'],
  D6: ['Data bit 6.', 'بت البيانات 6.'],
  D7: ['Data bit 7.', 'بت البيانات 7.'],
  A: ['Backlight anode: 5V through 220 Ω.', 'مصعد الإضاءة الخلفية: 5V عبر 220 أوم.'],
  K: ['Backlight cathode: GND.', 'مهبط الإضاءة الخلفية: GND.'],
};

const LCD: GuideEntry = {
  ar: 'شاشة LCD حرفية 16×2',
  what: ['A 16×2 character display with the HD44780 controller, driven in 4-bit mode with six board pins.', 'شاشة حروف 16×2 بالمتحكم HD44780، تُقاد بوضع 4 بت باستخدام ستة أطراف من اللوحة.'],
  uses: [['Show sensor values and messages.', 'عرض قيم الحساسات والرسائل.'], ['Menus for stand-alone devices.', 'القوائم في الأجهزة المستقلة.']],
  steps: [
    ['VSS → GND, VDD → 5V. Backlight: A → 5V through 220 Ω, K → GND.', 'VSS ← GND و VDD ← 5V. الإضاءة الخلفية: A ← 5V عبر 220 أوم، K ← GND.'],
    ['V0 (contrast) to the wiper of a 10 kΩ potentiometer, or to GND. RW → GND.', 'V0 (التباين) إلى ماسحة مقاومة متغيرة 10 كيلو أوم أو إلى GND. و RW ← GND.'],
    ['RS → 12, E → 11, D4 → 5, D5 → 4, D6 → 3, D7 → 2.', 'RS ← 12، E ← 11، D4 ← 5، D5 ← 4، D6 ← 3، D7 ← 2.'],
  ],
  code: `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2); // RS, E, D4, D5, D6, D7

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hello!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print(millis() / 1000);
}`,
  tips: [
    ['A real LCD showing only blocks needs its contrast (V0) adjusted.', 'الشاشة الحقيقية التي تُظهر مربعات فقط تحتاج ضبط التباين (V0).'],
    ['D0–D3 stay unconnected in 4-bit mode.', 'تبقى D0–D3 غير موصولة في وضع 4 بت.'],
    ['The I2C version needs only four wires.', 'نسخة I2C تحتاج أربعة أسلاك فقط.'],
  ],
  pins: LCD_PINS,
  board: {
    VSS: GND,
    VDD: V5,
    V0: GND,
    RS: ['D12', 'GP16'],
    RW: GND,
    E: ['D11', 'GP17'],
    D0: ['', ''],
    D1: ['', ''],
    D2: ['', ''],
    D3: ['', ''],
    D4: ['D5', 'GP18'],
    D5: ['D4', 'GP19'],
    D6: ['D3', 'GP20'],
    D7: ['D2', 'GP21'],
    A: ['5V → 220 Ω', 'VBUS → 220 Ω'],
    K: GND,
  },
};

const I2C: Record<string, BoardPins> = { SDA: ['A4', 'GP4'], SCL: ['A5', 'GP5'] };
const I2C_PINS: Record<string, L> = {
  SDA: ['I2C data.', 'بيانات I2C.'],
  SCL: ['I2C clock.', 'ساعة I2C.'],
};

const LCD_I2C: GuideEntry = {
  ar: 'شاشة LCD 16×2 بواجهة I2C',
  what: ['A 16×2 character LCD with an I2C backpack (PCF8574). It needs only four wires.', 'شاشة حروف 16×2 مع لوحة I2C خلفية (PCF8574). تحتاج أربعة أسلاك فقط.'],
  uses: LCD.uses,
  steps: [
    ['GND → GND, VCC → 5V.', 'GND ← GND و VCC ← 5V.'],
    ['SDA → A4, SCL → A5 on the Uno.', 'SDA ← A4 و SCL ← A5 في Uno.'],
  ],
  code: `#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("Hello!");
}

void loop() {}`,
  tips: [['Nothing on screen? The address may be 0x3F instead of 0x27: change it in the Inspector or run an I2C scanner.', 'لا شيء على الشاشة؟ قد يكون العنوان 0x3F بدل 0x27: غيّره في لوحة الخصائص أو شغّل ماسح I2C.']],
  pins: { GND: ['Ground.', 'الأرضي.'], VCC: ['5 V supply.', 'تغذية 5 فولت.'], ...I2C_PINS },
  board: { GND, VCC: V5, ...I2C },
};

const OLED: GuideEntry = {
  ar: 'شاشة OLED 128×64',
  what: ['A small monochrome display of 128×64 pixels with the SSD1306 controller, connected over I2C (address 0x3C).', 'شاشة صغيرة أحادية اللون بدقة 128×64 بكسل بالمتحكم SSD1306، تتصل عبر I2C (العنوان 0x3C).'],
  uses: [['Text, graphics and icons.', 'النصوص والرسوم والأيقونات.'], ['Small dashboards and plots.', 'لوحات معلومات ورسوم بيانية صغيرة.']],
  steps: [
    ['GND → GND, VIN → 5V.', 'GND ← GND و VIN ← 5V.'],
    ['DATA (SDA) → A4, CLK (SCL) → A5 on the Uno.', 'DATA (SDA) ← A4 و CLK (SCL) ← A5 في Uno.'],
  ],
  code: `#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.println("Hello!");
  display.display();
}

void loop() {}`,
  tips: [
    ['Call `display.display()` after drawing: nothing appears until then.', 'استدعِ `display.display()` بعد الرسم: لن يظهر شيء قبل ذلك.'],
    ['The screen buffer uses 1 KB of the Uno’s 2 KB of RAM.', 'ذاكرة الشاشة المؤقتة تستهلك 1 كيلوبايت من أصل 2 كيلوبايت في Uno.'],
  ],
  pins: {
    DATA: ['I2C data (SDA).', 'بيانات I2C (SDA).'],
    CLK: ['I2C clock (SCL).', 'ساعة I2C (SCL).'],
    DC: ['SPI mode only (not simulated).', 'لوضع SPI فقط (غير مُحاكى).'],
    RST: ['Reset (not needed for I2C).', 'إعادة الضبط (غير لازم مع I2C).'],
    CS: ['SPI mode only (not simulated).', 'لوضع SPI فقط (غير مُحاكى).'],
    '3V3': ['3.3 V supply (alternative to VIN).', 'تغذية 3.3 فولت (بديل عن VIN).'],
    VIN: ['Supply, 3.3–5 V.', 'التغذية، من 3.3 إلى 5 فولت.'],
    GND: ['Ground.', 'الأرضي.'],
  },
  board: { DATA: I2C.SDA, CLK: I2C.SCL, DC: ['', ''], RST: ['', ''], CS: ['', ''], '3V3': ['', ''], VIN: VCC, GND },
};

// ---------------------------------------------------------------- buttons and switches

const BUTTON: GuideEntry = {
  ar: 'زر ضغط',
  what: ['A momentary switch: its contacts close only while you press it.', 'مفتاح لحظي: تتصل نقاطه فقط ما دمت ضاغطاً عليه.'],
  uses: [['User input: start, stop, next, reset.', 'إدخال المستخدم: بدء، إيقاف، التالي، إعادة.'], ['Count presses and detect long presses.', 'عدّ الضغطات وكشف الضغط الطويل.']],
  steps: [
    ['Place it across the middle gap of the breadboard.', 'ضعه فوق الفجوة الوسطى للوحة التجارب.'],
    ['One side (1) to an input pin, the other side (2) to GND.', 'أحد الجانبين (1) إلى طرف إدخال، والجانب الآخر (2) إلى GND.'],
    ['`pinMode(2, INPUT_PULLUP);` — the pin reads HIGH when released and LOW when pressed.', '`pinMode(2, INPUT_PULLUP);` — يقرأ الطرف HIGH عند الترك و LOW عند الضغط.'],
  ],
  tips: [
    ['Without a pull-up or pull-down the input floats and reads random values.', 'بدون مقاومة رفع أو خفض يبقى المدخل عائماً ويقرأ قيماً عشوائية.'],
    ['Real buttons bounce: debounce with a short delay or a library (bounce is not simulated).', 'الأزرار الحقيقية ترتد: عالجها بتأخير قصير أو بمكتبة (الارتداد غير مُحاكى).'],
    ['Click and hold the button while the simulation runs.', 'انقر على الزر واستمر بالضغط أثناء تشغيل المحاكاة.'],
  ],
  code: `void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(2) == LOW;
  digitalWrite(13, pressed ? HIGH : LOW);
}`,
  pins: {
    '1': ['Legs 1.l and 1.r: always connected to each other.', 'الرِّجلان 1.l و 1.r: متصلتان ببعضهما دائماً.'],
    '2': ['Legs 2.l and 2.r: joined to 1 while pressed.', 'الرِّجلان 2.l و 2.r: تتصلان بـ 1 عند الضغط.'],
  },
  board: { '1': ['D2', 'GP14'], '2': GND },
};

const SLIDE_SWITCH: GuideEntry = {
  ar: 'مفتاح منزلق',
  what: ['A switch with three pins: the middle pin (COM) connects to pin 1 or pin 3, depending on the slider.', 'مفتاح بثلاثة أطراف: الطرف الأوسط (COM) يتصل بالطرف 1 أو بالطرف 3 حسب موضع المنزلق.'],
  uses: [['On/off and mode selection.', 'التشغيل والإطفاء واختيار الوضع.'], ['Choose between two signals or supplies.', 'الاختيار بين إشارتين أو مصدرين.']],
  steps: [
    ['COM (middle) to an input pin.', 'COM (الأوسط) إلى طرف إدخال.'],
    ['Pin 1 to GND and pin 3 to 5V: the input then reads LOW or HIGH.', 'الطرف 1 إلى GND والطرف 3 إلى 5V: فيقرأ المدخل LOW أو HIGH.'],
  ],
  tips: [['Click it to toggle, also while the simulation runs.', 'انقر عليه للتبديل، حتى أثناء المحاكاة.']],
  pins: { '1': ['Contact 1.', 'نقطة التلامس 1.'], '2': ['Common (middle).', 'المشترك (الأوسط).'], '3': ['Contact 3.', 'نقطة التلامس 3.'] },
  board: { '1': GND, '2': ['D2', 'GP14'], '3': VCC },
};

const DIP_SWITCH: GuideEntry = {
  ar: 'مفتاح DIP ثماني',
  what: ['Eight small independent on/off switches in one package. Each one connects its pin "a" to its pin "b".', 'ثمانية مفاتيح صغيرة مستقلة في غلاف واحد. كل مفتاح يوصل طرفه "a" بطرفه "b".'],
  uses: [['Set a device address or options.', 'ضبط عنوان الجهاز أو خياراته.'], ['Binary input for logic experiments.', 'إدخال ثنائي لتجارب المنطق الرقمي.']],
  steps: [
    ['Side a of each switch to an input pin with `INPUT_PULLUP`.', 'الجانب a من كل مفتاح إلى طرف إدخال مع `INPUT_PULLUP`.'],
    ['Side b of all switches to GND. A switch that is ON reads LOW.', 'الجانب b لكل المفاتيح إلى GND. المفتاح المشغّل يُقرأ LOW.'],
  ],
  tips: [['Click a lever to flip it (when stopped, select the part first).', 'انقر على ذراع لقلبه (عند التوقف حدّد القطعة أولاً).']],
  pins: Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n): [string, L][] => [
      [`${n}a`, [`Switch ${n}, side a.`, `المفتاح ${n}، الجانب a.`]],
      [`${n}b`, [`Switch ${n}, side b.`, `المفتاح ${n}، الجانب b.`]],
    ]),
  ),
  board: Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n): [string, BoardPins][] => [
      [`${n}a`, [`D${n + 1}`, `GP${n + 1}`]],
      [`${n}b`, GND],
    ]),
  ),
};

const KEYPAD: GuideEntry = {
  ar: 'لوحة مفاتيح 4×4',
  what: ['Sixteen keys in a 4×4 grid. Pressing a key connects its row (R1–R4) to its column (C1–C4), so 8 pins read 16 keys.', 'ستة عشر مفتاحاً في شبكة 4×4. الضغط على مفتاح يوصل صفّه (R1–R4) بعموده (C1–C4)، فتُقرأ 16 مفتاحاً بثمانية أطراف.'],
  uses: [['Code locks and PIN entry.', 'الأقفال الرقمية وإدخال الرمز السري.'], ['Calculators and menus.', 'الحاسبات والقوائم.']],
  steps: [
    ['Rows R1–R4 to pins 9, 8, 7, 6; columns C1–C4 to pins 5, 4, 3, 2.', 'الصفوف R1–R4 إلى الأطراف 9، 8، 7، 6؛ والأعمدة C1–C4 إلى الأطراف 5، 4، 3، 2.'],
  ],
  code: `#include <Keypad.h>
char keys[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte rowPins[4] = {9, 8, 7, 6};
byte colPins[4] = {5, 4, 3, 2};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);

void setup() { Serial.begin(9600); }

void loop() {
  char k = keypad.getKey();
  if (k) Serial.println(k);
}`,
  tips: [['Click the keys while simulating.', 'انقر على المفاتيح أثناء المحاكاة.']],
  pins: Object.fromEntries([1, 2, 3, 4].flatMap((n): [string, L][] => [
    [`R${n}`, [`Row ${n}.`, `الصف ${n}.`]],
    [`C${n}`, [`Column ${n}.`, `العمود ${n}.`]],
  ])),
  board: {
    R1: ['D9', 'GP9'],
    R2: ['D8', 'GP8'],
    R3: ['D7', 'GP7'],
    R4: ['D6', 'GP6'],
    C1: ['D5', 'GP5'],
    C2: ['D4', 'GP4'],
    C3: ['D3', 'GP3'],
    C4: ['D2', 'GP2'],
  },
};

const JOYSTICK: GuideEntry = {
  ar: 'عصا تحكم تماثلية',
  what: ['Two potentiometers (horizontal and vertical) under a stick, plus a push switch when you press the stick down.', 'مقاومتان متغيرتان (أفقية وعمودية) تحت عصا، مع مفتاح ضغط عند ضغط العصا للأسفل.'],
  uses: [['Steer robots and cars.', 'توجيه الروبوتات والسيارات.'], ['Games and pan/tilt control.', 'الألعاب والتحكم بالتدوير والإمالة.']],
  steps: [
    ['VCC → 5V, GND → GND.', 'VCC ← 5V و GND ← GND.'],
    ['VERT → A0, HORZ → A1: about 512 at rest, 0 to 1023 at the ends.', 'VERT ← A0 و HORZ ← A1: نحو 512 عند السكون، ومن 0 إلى 1023 عند الأطراف.'],
    ['SEL → pin 2 with `INPUT_PULLUP`: LOW while the stick is pressed.', 'SEL ← الطرف 2 مع `INPUT_PULLUP`: يكون LOW أثناء ضغط العصا.'],
  ],
  tips: [['Drag the stick while simulating (it springs back); click it to press.', 'اسحب العصا أثناء المحاكاة (تعود لمكانها)؛ وانقر عليها للضغط.']],
  pins: {
    VCC: ['Supply.', 'التغذية.'],
    VERT: ['Vertical position (analog).', 'الموضع العمودي (تماثلي).'],
    HORZ: ['Horizontal position (analog).', 'الموضع الأفقي (تماثلي).'],
    SEL: ['Push switch to GND (use `INPUT_PULLUP`).', 'مفتاح ضغط إلى GND (استخدم `INPUT_PULLUP`).'],
    GND: ['Ground.', 'الأرضي.'],
  },
  board: { VCC, VERT: ['A0', 'GP26'], HORZ: ['A1', 'GP27'], SEL: ['D2', 'GP15'], GND },
};

const ENCODER: GuideEntry = {
  ar: 'مرمّز دوّار KY-040',
  what: ['A knob that turns endlessly and reports steps (20 per turn) in either direction, plus a push switch.', 'مقبض يدور بلا نهاية ويُرسل خطوات (20 في الدورة) في الاتجاهين، مع مفتاح ضغط.'],
  uses: [['Menus and settings (turn to choose, press to confirm).', 'القوائم والإعدادات (أدِر للاختيار واضغط للتأكيد).'], ['Volume and position control.', 'التحكم بالصوت والموضع.']],
  steps: [
    ['+ (VCC) → 5V, GND → GND.', '+ (VCC) ← 5V و GND ← GND.'],
    ['CLK → 2, DT → 3, SW → 4.', 'CLK ← 2 و DT ← 3 و SW ← 4.'],
    ['When CLK changes, compare it with DT: different = clockwise, equal = anticlockwise.', 'عندما يتغير CLK قارنه بـ DT: مختلفان = مع عقارب الساعة، متساويان = عكسها.'],
  ],
  tips: [['Unlike a potentiometer it has no absolute position: count the steps.', 'بخلاف المقاومة المتغيرة ليس له موضع مطلق: عُدّ الخطوات.']],
  pins: {
    CLK: ['Output A (pulses while turning).', 'الخرج A (نبضات أثناء الدوران).'],
    DT: ['Output B (gives the direction).', 'الخرج B (يحدد الاتجاه).'],
    SW: ['Push switch, LOW when pressed.', 'مفتاح الضغط، LOW عند الضغط.'],
    VCC: ['Supply.', 'التغذية.'],
    GND: ['Ground.', 'الأرضي.'],
  },
  board: { CLK: ['D2', 'GP14'], DT: ['D3', 'GP15'], SW: ['D4', 'GP13'], VCC, GND },
};

const BUZZER: GuideEntry = {
  ar: 'طنّان بيزو',
  what: ['A piezo disc that clicks at every voltage change. Driven with a frequency, it plays a tone.', 'قرص بيزو يُصدر نقرة عند كل تغيّر في الجهد. عند تغذيته بتردد يعزف نغمة.'],
  uses: [['Beeps, alarms and melodies.', 'التنبيهات والإنذارات والألحان.'], ['Feedback when a key is pressed.', 'إشعار صوتي عند ضغط مفتاح.']],
  steps: [
    ['Pin 1 → an output pin, pin 2 → GND.', 'الطرف 1 ← طرف إخراج، والطرف 2 ← GND.'],
  ],
  code: `void setup() {}

void loop() {
  tone(8, 440);  // A4 for half a second
  delay(500);
  noTone(8);
  delay(500);
}`,
  tips: [
    ['A passive buzzer needs a changing signal: `digitalWrite(HIGH)` alone is silent.', 'الطنّان السلبي يحتاج إشارة متغيرة: `digitalWrite(HIGH)` وحدها لا تُصدر صوتاً.'],
    ['Turn sound on (Settings › Sound) to hear it.', 'فعّل الصوت (الإعدادات › الصوت) لتسمعه.'],
  ],
  pins: { '1': ['Signal (from the pin).', 'الإشارة (من الطرف).'], '2': ['To GND.', 'إلى GND.'] },
  board: { '1': ['D8', 'GP15'], '2': GND },
};

export const IO: Record<string, GuideEntry> = {
  'evlab.led': LED,
  'evlab.rgb-led': RGB_LED,
  'evlab.7segment': SEVEN_SEGMENT,
  'evlab.led-bar-graph': BAR_GRAPH,
  'evlab.neopixel': NEOPIXEL,
  'evlab.neopixel-matrix': { ...NEOPIXEL_GROUP, ar: 'مصفوفة NeoPixel 8×8', what: ['An 8×8 matrix of 64 addressable RGB LEDs (WS2812), numbered row by row from the top left.', 'مصفوفة 8×8 من 64 LED ملوناً قابلاً للعنونة (WS2812)، مرقّمة صفاً بعد صف من أعلى اليسار.'] },
  'evlab.neopixel-ring': { ...NEOPIXEL_GROUP, ar: 'حلقة NeoPixel (16)', what: ['A ring of 16 addressable RGB LEDs (WS2812).', 'حلقة من 16 LED ملوناً قابلاً للعنونة (WS2812).'] },
  'evlab.lcd1602': LCD,
  'evlab.lcd2004': { ...LCD, ar: 'شاشة LCD حرفية 20×4', what: ['A 20×4 character display with the HD44780 controller, driven in 4-bit mode with six board pins.', 'شاشة حروف 20×4 بالمتحكم HD44780، تُقاد بوضع 4 بت باستخدام ستة أطراف من اللوحة.'] },
  'evlab.lcd1602-i2c': LCD_I2C,
  'evlab.ssd1306': OLED,
  'evlab.pushbutton': BUTTON,
  'evlab.pushbutton-6mm': { ...BUTTON, ar: 'زر ضغط صغير (6 مم)' },
  'evlab.slide-switch': SLIDE_SWITCH,
  'evlab.dip-switch-8': DIP_SWITCH,
  'evlab.keypad-4x4': KEYPAD,
  'evlab.joystick': JOYSTICK,
  'evlab.ky040': ENCODER,
  'evlab.buzzer': BUZZER,
};
