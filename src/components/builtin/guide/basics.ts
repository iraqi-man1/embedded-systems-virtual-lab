/**
 * Guide content: the simulated boards, prototyping aids, power sources,
 * passive parts and semiconductors.
 */
import type { BoardPins, GuideEntry, L } from './types';

const GND: BoardPins = ['GND', 'GND'];

// ---------------------------------------------------------------- boards

const ARDUINO_PINS: Record<string, L> = {
  '5V': ['Regulated 5 V output (from USB or the barrel jack). Powers sensors and modules.', 'خرج 5 فولت منظَّم (من USB أو مقبس التغذية). يغذّي الحساسات والوحدات.'],
  '3.3V': ['3.3 V output, up to about 150 mA. For 3.3 V modules.', 'خرج 3.3 فولت، حتى 150 ملي أمبير تقريباً. للوحدات التي تعمل على 3.3 فولت.'],
  GND: ['Ground (0 V). Every part in the circuit must share it.', 'الأرضي (0 فولت). يجب أن تشترك فيه كل قطع الدائرة.'],
  VIN: ['Input for an external 7–12 V supply (not powered when running from USB).', 'دخل لمصدر خارجي 7–12 فولت (لا يحمل جهداً عند التشغيل من USB).'],
  IOREF: ['Tells shields the logic voltage of the board (5 V).', 'يُعلم الدروع (Shields) بجهد منطق اللوحة (5 فولت).'],
  RESET: ['Pull LOW to restart the sketch.', 'اسحبه إلى LOW لإعادة تشغيل البرنامج.'],
  AREF: ['Reference voltage for `analogRead()` (optional).', 'الجهد المرجعي لـ `analogRead()` (اختياري).'],
  '0': ['Digital I/O. Serial RX: receives from the Serial Monitor — keep it free.', 'دخل/خرج رقمي. استقبال المنفذ التسلسلي RX: يستقبل من مراقب السيريال — اتركه حراً.'],
  '1': ['Digital I/O. Serial TX: sends to the Serial Monitor — keep it free.', 'دخل/خرج رقمي. إرسال المنفذ التسلسلي TX: يرسل إلى مراقب السيريال — اتركه حراً.'],
  '13': ['Digital I/O with the on-board LED "L". Also SPI SCK.', 'دخل/خرج رقمي متصل بالـ LED المدمج "L". وهو أيضاً SCK لناقل SPI.'],
  A4: ['Analog input; also I2C data (SDA).', 'دخل تماثلي؛ وهو أيضاً خط بيانات I2C (SDA).'],
  A5: ['Analog input; also I2C clock (SCL).', 'دخل تماثلي؛ وهو أيضاً خط ساعة I2C (SCL).'],
};

const ARDUINO_STEPS: L[] = [
  ['Place the board on the canvas and write the sketch in the code editor (`setup()` runs once, `loop()` repeats).', 'ضع اللوحة على لوحة الرسم واكتب البرنامج في محرر الشيفرة (`setup()` تعمل مرة واحدة و `loop()` تتكرر).'],
  ['Connect outputs (LEDs, buzzers, drivers) and inputs (buttons, sensors) to the digital pins 2–13 or the analog pins A0–A5.', 'صِل المخارج (LED، طنّان، مشغّلات) والمداخل (أزرار، حساسات) بالأطراف الرقمية 2–13 أو التماثلية A0–A5.'],
  ['Take power for modules from 5V (or 3.3V) and connect every ground to GND.', 'خذ تغذية الوحدات من 5V (أو 3.3V) وصِل كل الأرضيات بـ GND.'],
  ['Press Run (F5): the sketch is compiled and runs on the emulated chip, cycle by cycle.', 'اضغط تشغيل (F5): يُترجَم البرنامج ويعمل على الشريحة المُحاكاة دورةً بدورة.'],
];

const ARDUINO_TIPS: L[] = [
  ['Keep pins 0 and 1 free: they carry the Serial Monitor.', 'اترك الطرفين 0 و 1 حرّين: يمرّ عبرهما مراقب السيريال.'],
  ['An I/O pin should give at most 20 mA (40 mA absolute maximum). Motors, relays and LED strips need a transistor or a driver.', 'لا يجوز أن يعطي طرف الإدخال/الإخراج أكثر من 20 ملي أمبير (40 حداً مطلقاً). المحركات والمرحّلات وأشرطة LED تحتاج ترانزستوراً أو مشغّلاً.'],
  ['Only the pins marked ~ (3, 5, 6, 9, 10, 11) produce PWM with `analogWrite()`.', 'الأطراف المعلَّمة بـ ~ فقط (3، 5، 6، 9، 10، 11) تُخرج PWM باستخدام `analogWrite()`.'],
];

const UNO: GuideEntry = {
  ar: 'لوحة Arduino Uno',
  what: [
    'A beginner-friendly microcontroller board built around the ATmega328P (16 MHz, 5 V logic). It runs one program, the sketch, that reads inputs and controls outputs.',
    'لوحة متحكم دقيق مناسبة للمبتدئين مبنية على الشريحة ATmega328P (بتردد 16 ميغاهيرتز ومنطق 5 فولت). تشغّل برنامجاً واحداً يسمى Sketch يقرأ المداخل ويتحكم بالمخارج.',
  ],
  uses: [
    ['Control LEDs, motors, relays and displays.', 'التحكم بالـ LED والمحركات والمرحّلات والشاشات.'],
    ['Read buttons, potentiometers and sensors.', 'قراءة الأزرار والمقاومات المتغيرة والحساسات.'],
    ['Learn embedded programming and build prototypes.', 'تعلّم برمجة الأنظمة المدمجة وبناء النماذج الأولية.'],
  ],
  steps: ARDUINO_STEPS,
  tips: ARDUINO_TIPS,
  code: `void setup() {
  pinMode(13, OUTPUT);     // the on-board LED
  Serial.begin(9600);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
  Serial.println("blink");
}`,
  pins: ARDUINO_PINS,
};

const NANO: GuideEntry = {
  ...UNO,
  ar: 'لوحة Arduino Nano',
  what: [
    'The same ATmega328P as the Uno on a small board that plugs straight into a breadboard. It has two extra analog inputs (A6, A7, analog only).',
    'نفس شريحة ATmega328P الموجودة في Uno لكن على لوحة صغيرة تُغرز مباشرة في لوحة التجارب. فيها مدخلان تماثليان إضافيان (A6 و A7، تماثليان فقط).',
  ],
  uses: [
    ['Compact projects built on a breadboard.', 'مشاريع صغيرة الحجم تُبنى على لوحة التجارب.'],
    ['Anything an Uno does, in less space.', 'كل ما تفعله Uno لكن بمساحة أصغر.'],
  ],
  steps: [
    ['Plug the Nano across the middle gap of the breadboard so each pin gets its own column.', 'اغرز الـ Nano فوق الفجوة الوسطى للوحة التجارب بحيث يأخذ كل طرف عموداً خاصاً به.'],
    ['Connect 5V and GND to the breadboard rails to power the other parts.', 'صِل 5V و GND بمسارات التغذية في لوحة التجارب لتغذية بقية القطع.'],
    ...ARDUINO_STEPS.slice(1, 2),
    ARDUINO_STEPS[3],
  ],
  pins: {
    ...Object.fromEntries(Object.entries(ARDUINO_PINS).filter(([k]) => k !== 'IOREF')),
    A6: ['Analog input only (no digital I/O).', 'دخل تماثلي فقط (لا يعمل كدخل/خرج رقمي).'],
    A7: ['Analog input only (no digital I/O).', 'دخل تماثلي فقط (لا يعمل كدخل/خرج رقمي).'],
  },
};

// ---------------------------------------------------------------- prototyping

const BREADBOARD: GuideEntry = {
  ar: 'لوحة تجارب',
  what: [
    'A plastic board with metal spring clips under the holes, so parts can be connected without soldering.',
    'لوحة بلاستيكية تحت ثقوبها مشابك معدنية نابضة، فتتوصل القطع ببعضها دون لحام.',
  ],
  uses: [
    ['Build and change circuits quickly.', 'بناء الدوائر وتعديلها بسرعة.'],
    ['Hold chips (DIP ICs), modules and boards such as the Nano.', 'تثبيت الشرائح (DIP) والوحدات واللوحات مثل Nano.'],
  ],
  steps: [
    ['In each short column of 5 holes (a–e, and f–j) the holes are connected together. The gap in the middle separates the two halves.', 'في كل عمود قصير من 5 ثقوب (a–e و f–j) تكون الثقوب متصلة ببعضها. الفجوة الوسطى تفصل النصفين.'],
    ['The long rails along the edges (+ red, − blue) run the length of the board: connect them to 5V and GND.', 'المسارات الطويلة على الحواف (+ أحمر، − أزرق) تمتد بطول اللوحة: صِلها بـ 5V و GND.'],
    ['Place a chip across the middle gap so each of its legs lands in its own column.', 'ضع الشريحة فوق الفجوة الوسطى بحيث تقع كل رِجل منها في عمود مستقل.'],
    ['Drop a part onto the board: legs over holes plug in automatically (the holes light up).', 'أفلت القطعة فوق اللوحة: الأرجل الواقعة فوق الثقوب تُغرز تلقائياً (تضيء الثقوب).'],
  ],
  tips: [
    ['Two legs of the same part in the same column are shorted. A resistor must span two different columns.', 'رِجلان للقطعة نفسها في العمود نفسه تكونان في قِصَر. يجب أن تمتد المقاومة على عمودين مختلفين.'],
    ['Hover a hole to see everything connected to it.', 'مرّر الماوس فوق ثقب لترى كل ما يتصل به.'],
  ],
  board: null,
};

const BREADBOARD_MINI: GuideEntry = {
  ...BREADBOARD,
  ar: 'لوحة تجارب صغيرة',
  steps: [
    BREADBOARD.steps![0],
    ['The mini board has no power rails: bring 5V and GND to a free column.', 'اللوحة الصغيرة بلا مسارات تغذية: أوصل 5V و GND إلى عمود فارغ.'],
    BREADBOARD.steps![2],
    BREADBOARD.steps![3],
  ],
};

const SYMBOL_GROUND: GuideEntry = {
  ar: 'رمز الأرضي',
  what: ['A ground symbol. Every ground symbol is connected to every other one, so fewer wires are needed.', 'رمز الأرضي. كل رموز الأرضي متصلة ببعضها، فتحتاج أسلاكاً أقل.'],
  uses: [['Tidy circuits with many ground connections.', 'ترتيب الدوائر التي فيها وصلات أرضي كثيرة.']],
  steps: [
    ['Place one ground symbol and wire it to the board GND.', 'ضع رمز أرضي واحداً وصِله بـ GND اللوحة.'],
    ['Place more symbols next to the parts that need ground and wire them to those parts.', 'ضع رموزاً أخرى قرب القطع التي تحتاج الأرضي وصِلها بها.'],
  ],
  pins: { GND: ['Connected to all ground symbols.', 'متصل بكل رموز الأرضي.'] },
  board: { GND },
};

const NET_LABEL: GuideEntry = {
  ar: 'تسمية شبكة',
  what: ['A named connection point: all labels with the same name are connected without a wire.', 'نقطة توصيل لها اسم: كل التسميات التي تحمل الاسم نفسه متصلة دون سلك.'],
  uses: [['Connect distant parts of a large circuit without long wires.', 'توصيل أجزاء متباعدة في دائرة كبيرة دون أسلاك طويلة.'], ['Name signals (SDA, MOTOR+) so the circuit reads like a schematic.', 'تسمية الإشارات (SDA، MOTOR+) لتُقرأ الدائرة كمخطط.']],
  steps: [
    ['Place a label and set its name in the Inspector.', 'ضع تسمية واكتب اسمها في لوحة الخصائص.'],
    ['Wire it to a pin. Any other label with the same name is now connected to that pin.', 'صِلها بطرف. أي تسمية أخرى بالاسم نفسه أصبحت متصلة بهذا الطرف.'],
  ],
  pins: { NET: ['Joined to every label with the same name.', 'متصل بكل تسمية تحمل الاسم نفسه.'] },
  board: null,
};

const JUNCTION: GuideEntry = {
  ar: 'نقطة تفرّع',
  what: ['A dot that joins several wires at one point.', 'نقطة تجمع عدة أسلاك في مكان واحد.'],
  uses: [['Branch one signal or supply to several parts.', 'توزيع إشارة أو تغذية واحدة على عدة قطع.']],
  steps: [['Place it where wires meet and wire each branch to it.', 'ضعها حيث تلتقي الأسلاك وصِل كل فرع بها.']],
  pins: { J: ['Every wire attached here is connected.', 'كل الأسلاك الموصولة هنا متصلة ببعضها.'] },
  board: null,
};

// ---------------------------------------------------------------- power

const BATTERY_9V: GuideEntry = {
  ar: 'بطارية 9 فولت',
  what: ['A 9 V battery: a DC voltage source with a + and a − terminal.', 'بطارية 9 فولت: مصدر جهد مستمر له طرف موجب (+) وطرف سالب (−).'],
  uses: [['Run a circuit without a board or USB.', 'تشغيل دائرة دون لوحة أو USB.'], ['Feed the Uno through VIN (7–12 V).', 'تغذية Uno عبر الطرف VIN (7–12 فولت).']],
  steps: [
    ['+ to the supply rail of the circuit, − to its ground.', 'الطرف + إلى مسار التغذية في الدائرة، والطرف − إلى الأرضي.'],
    ['If the circuit also uses a board, wire − to the board GND so they share ground.', 'إذا كانت الدائرة تستخدم لوحة أيضاً فصِل − بـ GND اللوحة ليشتركا في الأرضي.'],
  ],
  tips: [
    ['The − terminal is not ground until you connect it to GND.', 'الطرف − ليس أرضياً حتى تصله بـ GND.'],
    ['Never connect 9 V to a 5 V or 3.3 V pin.', 'لا تصل 9 فولت أبداً بطرف 5 أو 3.3 فولت.'],
  ],
  pins: { '+': ['Positive terminal.', 'الطرف الموجب.'], '-': ['Negative terminal.', 'الطرف السالب.'] },
  board: { '+': ['VIN', ''], '-': GND },
};

const BATTERY_2AA: GuideEntry = {
  ...BATTERY_9V,
  ar: 'حامل بطاريتين AA',
  what: ['Two AA cells in series: about 3 V.', 'بطاريتان AA على التوالي: نحو 3 فولت.'],
  uses: [['Power LEDs and small 3 V circuits.', 'تغذية الـ LED والدوائر الصغيرة التي تعمل على 3 فولت.'], ['Feed a Raspberry Pi Pico through VSYS.', 'تغذية Raspberry Pi Pico عبر الطرف VSYS.']],
  tips: [['The − terminal is not ground until you connect it to GND.', 'الطرف − ليس أرضياً حتى تصله بـ GND.']],
  board: { '+': ['', 'VSYS'], '-': GND },
};

const BENCH_SUPPLY: GuideEntry = {
  ar: 'مزوّد طاقة مختبري',
  what: ['An adjustable lab power supply: set the voltage and the current limit in the Inspector.', 'مزوّد طاقة مختبري قابل للضبط: اضبط الجهد وحد التيار من لوحة الخصائص.'],
  uses: [['Power circuits without a microcontroller (logic gates, transistors).', 'تغذية دوائر بلا متحكم (بوابات منطقية، ترانزستورات).'], ['Supply motors and higher voltages separately from the board.', 'تغذية المحركات والجهود الأعلى بشكل منفصل عن اللوحة.']],
  steps: [
    ['+ to the supply rail, − to ground.', 'الطرف + إلى مسار التغذية، والطرف − إلى الأرضي.'],
    ['When a board is in the same circuit, connect − to its GND.', 'إذا كانت هناك لوحة في الدائرة نفسها فصِل − بـ GND الخاص بها.'],
  ],
  tips: [['The simulator reports when the load draws more than the current limit.', 'تنبّهك المحاكاة إذا سحب الحمل تياراً أكبر من الحد المضبوط.']],
  pins: BATTERY_9V.pins,
  board: { '-': GND },
};

// ---------------------------------------------------------------- passives

const RESISTOR: GuideEntry = {
  ar: 'مقاومة',
  what: ['Limits the current that flows through it. Its value in ohms (Ω) is shown by the colour bands.', 'تحدّ من التيار المار خلالها. تُبيّن الحلقات الملونة قيمتها بالأوم (Ω).'],
  uses: [
    ['Limit the current of an LED.', 'تحديد تيار الـ LED.'],
    ['Pull-up or pull-down for buttons and inputs.', 'مقاومة رفع أو خفض (Pull-up/Pull-down) للأزرار والمداخل.'],
    ['Voltage dividers for sensors.', 'مقسّمات الجهد للحساسات.'],
    ['Set the base current of a transistor.', 'ضبط تيار قاعدة الترانزستور.'],
  ],
  steps: [
    ['A resistor has no polarity: either leg can go either way.', 'المقاومة بلا قطبية: يمكن تركيب أي رِجل في أي اتجاه.'],
    ['In series with an LED: board pin → resistor → LED anode; LED cathode → GND.', 'على التوالي مع LED: طرف اللوحة ← المقاومة ← مصعد الـ LED؛ ومهبط الـ LED ← GND.'],
    ['Type the value in the Inspector: 220, 4.7k, 1M…', 'اكتب القيمة في لوحة الخصائص: 220، 4.7k، 1M…'],
  ],
  tips: [
    ["Ohm's law: I = V / R. 3 V across 220 Ω is about 14 mA.", 'قانون أوم: I = V / R. فرق جهد 3 فولت على 220 أوم يعطي نحو 14 ملي أمبير.'],
    ['For an LED on a 5 V pin, 220 Ω to 1 kΩ is safe.', 'للـ LED على طرف 5 فولت، القيم من 220 أوم إلى 1 كيلو أوم آمنة.'],
    ['The power rating (¼ W) must exceed V × I; the simulator warns when it is exceeded.', 'يجب أن تتجاوز قدرة المقاومة (¼ واط) حاصل V × I؛ وتنبّهك المحاكاة عند تجاوزها.'],
  ],
  pins: { '1': ['Either leg (no polarity).', 'أي رِجل (بلا قطبية).'], '2': ['Either leg (no polarity).', 'أي رِجل (بلا قطبية).'] },
  board: null,
};

const POT_PINS: Record<string, L> = {
  VCC: ['One end of the track: to 5V (or 3.3V).', 'أحد طرفي المسار: إلى 5V (أو 3.3V).'],
  GND: ['The other end of the track: to GND.', 'الطرف الآخر للمسار: إلى GND.'],
  SIG: ['Wiper: a voltage between the two ends, set by the knob.', 'الماسحة: جهد بين الطرفين يحدده موضع المقبض.'],
};

const POTENTIOMETER: GuideEntry = {
  ar: 'مقاومة متغيرة (بوتنشوميتر)',
  what: ['A variable resistor with a knob. The middle pin (wiper) gives a voltage between the two ends.', 'مقاومة متغيرة بمقبض. الطرف الأوسط (الماسحة) يعطي جهداً بين جهدَي الطرفين.'],
  uses: [
    ['A knob for volume, brightness or speed.', 'مقبض للتحكم بالصوت أو السطوع أو السرعة.'],
    ['Set a threshold or a target value.', 'ضبط عتبة أو قيمة مستهدفة.'],
    ['Practise `analogRead()`.', 'التدرّب على `analogRead()`.'],
  ],
  steps: [
    ['One end to 5V, the other to GND.', 'أحد الطرفين إلى 5V والآخر إلى GND.'],
    ['The wiper (SIG) to an analog pin, e.g. A0.', 'الماسحة (SIG) إلى طرف تماثلي، مثل A0.'],
    ['`analogRead(A0)` returns 0–1023 as you turn the knob.', 'تُرجع `analogRead(A0)` قيمة من 0 إلى 1023 حسب موضع المقبض.'],
  ],
  tips: [
    ['Swapping the two ends reverses the direction.', 'تبديل الطرفين يعكس الاتجاه.'],
    ['While simulating, drag the knob or scroll over it.', 'أثناء المحاكاة اسحب المقبض أو استخدم عجلة الماوس فوقه.'],
  ],
  code: `void setup() { Serial.begin(9600); }

void loop() {
  int value = analogRead(A0);          // 0 to 1023
  float volts = value * 5.0 / 1023;
  Serial.println(volts);
  delay(200);
}`,
  pins: POT_PINS,
  board: { VCC: ['5V', '3V3'], SIG: ['A0', 'GP26'], GND },
};

const DIVIDER_STEPS = (part: L): L[] => [
  [`Make a voltage divider: 5V → ${part[0]} → A0 → 10 kΩ → GND.`, `اصنع مقسّم جهد: 5V ← ${part[1]} ← A0 ← 10 كيلو أوم ← GND.`],
  ['Read the middle point with `analogRead(A0)`.', 'اقرأ نقطة المنتصف باستخدام `analogRead(A0)`.'],
];

const PHOTORESISTOR: GuideEntry = {
  ar: 'مقاومة ضوئية (LDR)',
  what: ['A resistor whose resistance falls as the light gets brighter (light-dependent resistor).', 'مقاومة تقل قيمتها كلما ازداد الضوء (مقاومة معتمدة على الضوء).'],
  uses: [['Day/night detection and automatic lights.', 'كشف الليل والنهار والإنارة التلقائية.'], ['A simple light meter.', 'مقياس ضوء بسيط.']],
  steps: [
    ...DIVIDER_STEPS(['LDR', 'المقاومة الضوئية']),
    ['The reading rises with brightness. Change the light (lux) on the part or in the Inspector while simulating.', 'ترتفع القراءة مع ازدياد الضوء. غيّر شدة الإضاءة (لوكس) على القطعة أو في لوحة الخصائص أثناء المحاكاة.'],
  ],
  pins: { '1': ['Either leg (no polarity).', 'أي رِجل (بلا قطبية).'], '2': ['Either leg (no polarity).', 'أي رِجل (بلا قطبية).'] },
  board: { '1': ['5V', '3V3'], '2': ['A0 + 10 kΩ → GND', 'GP26 + 10 kΩ → GND'] },
};

const NTC: GuideEntry = {
  ar: 'مقاومة حرارية NTC',
  what: ['A resistor whose resistance falls as the temperature rises: 10 kΩ at 25 °C.', 'مقاومة تقل قيمتها كلما ارتفعت الحرارة: 10 كيلو أوم عند 25 درجة مئوية.'],
  uses: [['Measure temperature cheaply.', 'قياس الحرارة بتكلفة قليلة.'], ['Thermostats and overheating protection.', 'منظمات الحرارة والحماية من السخونة الزائدة.']],
  steps: [
    ...DIVIDER_STEPS(['thermistor', 'المقاومة الحرارية']),
    ['Convert the reading to °C with the β formula (β = 3950).', 'حوّل القراءة إلى درجات مئوية بمعادلة β (β = 3950).'],
  ],
  pins: PHOTORESISTOR.pins,
  board: PHOTORESISTOR.board,
};

// ---------------------------------------------------------------- diodes

const DIODE_PINS: Record<string, L> = {
  A: ['Anode: current enters here.', 'المصعد (الأنود): يدخل منه التيار.'],
  K: ['Cathode, marked by the band: current leaves here.', 'المهبط (الكاثود)، تدل عليه الحلقة: يخرج منه التيار.'],
};

const DIODE: GuideEntry = {
  ar: 'ثنائي (دايود) 1N4007',
  what: ['Lets current flow one way only: from the anode (A) to the cathode (K, marked by the band). The 1N4007 handles 1 A.', 'يسمح بمرور التيار في اتجاه واحد فقط: من المصعد (A) إلى المهبط (K، تدل عليه الحلقة). يتحمل 1N4007 تياراً حتى 1 أمبير.'],
  uses: [
    ['Protect a circuit against a reversed supply.', 'حماية الدائرة من عكس قطبية التغذية.'],
    ['Flyback diode across relay coils and motors.', 'ثنائي حماية (Flyback) على ملفات المرحّلات والمحركات.'],
    ['Rectify AC to DC.', 'تقويم التيار المتناوب إلى مستمر.'],
  ],
  steps: [
    ['It conducts when the anode is about 0.7 V more positive than the cathode.', 'يوصل التيار عندما يكون المصعد أعلى من المهبط بنحو 0.7 فولت.'],
    ['As a flyback diode: cathode (band) to the + side of the coil, anode to the side that is switched to GND.', 'كثنائي حماية: المهبط (الحلقة) إلى الجهة الموجبة للملف، والمصعد إلى الجهة التي تُوصل بالأرضي عند التشغيل.'],
  ],
  tips: [['Put in backwards it blocks everything: check the band.', 'إذا رُكّب معكوساً يمنع كل شيء: تحقق من الحلقة.']],
  pins: DIODE_PINS,
  board: null,
};

const DIODE_1N4148: GuideEntry = {
  ...DIODE,
  ar: 'ثنائي إشارة 1N4148',
  what: ['A small, fast switching diode for signals (up to 200 mA). Current flows from anode (A) to cathode (K).', 'ثنائي صغير وسريع للإشارات (حتى 200 ملي أمبير). يمر التيار من المصعد (A) إلى المهبط (K).'],
  uses: [['Logic (diode OR/AND gates).', 'المنطق الرقمي (بوابات OR/AND بالثنائيات).'], ['Protect inputs and decouple signals.', 'حماية المداخل وفصل الإشارات.'], ['Flyback diode for small relays.', 'ثنائي حماية للمرحّلات الصغيرة.']],
};

const DIODE_SCHOTTKY: GuideEntry = {
  ...DIODE,
  ar: 'ثنائي شوتكي 1N5819',
  what: ['A Schottky diode: it drops only about 0.35 V, so less power is lost. Current flows from anode (A) to cathode (K).', 'ثنائي شوتكي: هبوط الجهد عليه نحو 0.35 فولت فقط، فيضيع جهد أقل. يمر التيار من المصعد (A) إلى المهبط (K).'],
  uses: [['Reverse-polarity protection with little voltage loss.', 'الحماية من عكس القطبية مع خسارة جهد قليلة.'], ['Power supplies and solar circuits.', 'مزوّدات الطاقة ودوائر الطاقة الشمسية.']],
};

const ZENER: GuideEntry = {
  ar: 'ثنائي زينر',
  what: ['Conducts backwards above its Zener voltage (5.1 V here), holding the voltage near that value.', 'يوصل التيار بالاتجاه العكسي فوق جهد زينر (5.1 فولت هنا)، فيثبّت الجهد قرب تلك القيمة.'],
  uses: [['A simple voltage reference or regulator.', 'مرجع جهد أو منظّم جهد بسيط.'], ['Clamp a signal to protect an input.', 'تحديد إشارة لحماية مدخل.']],
  steps: [
    ['Cathode (K) to the voltage you want to limit, anode (A) to GND.', 'المهبط (K) إلى الجهد المراد تحديده، والمصعد (A) إلى GND.'],
    ['Feed it through a series resistor so the current stays small.', 'غذِّه عبر مقاومة على التوالي ليبقى التيار صغيراً.'],
  ],
  tips: [['Without a series resistor the Zener current is unlimited.', 'بدون مقاومة على التوالي يصبح تيار الزينر غير محدود.']],
  pins: DIODE_PINS,
  board: null,
};

// ---------------------------------------------------------------- transistors

const NPN_PINS: Record<string, L> = {
  B: ['Base: a small current here switches it on (through a resistor).', 'القاعدة: تيار صغير فيها يشغّل الترانزستور (عبر مقاومة).'],
  C: ['Collector: to the load (the other side of the load goes to +).', 'المجمّع: إلى الحمل (والطرف الآخر للحمل إلى الموجب).'],
  E: ['Emitter: to GND.', 'الباعث: إلى GND.'],
};

const NPN: GuideEntry = {
  ar: 'ترانزستور NPN',
  what: ['An NPN transistor: a small current into the base (B) lets a much larger current flow from collector (C) to emitter (E). Mostly used as a switch.', 'ترانزستور NPN: تيار صغير يدخل القاعدة (B) يسمح بمرور تيار أكبر بكثير من المجمّع (C) إلى الباعث (E). يُستخدم غالباً كمفتاح.'],
  uses: [
    ['Switch relays, buzzers, LED strings and small motors from an I/O pin.', 'تشغيل المرحّلات والطنّانات وسلاسل الـ LED والمحركات الصغيرة من طرف إدخال/إخراج.'],
    ['Amplify small signals.', 'تكبير الإشارات الصغيرة.'],
  ],
  steps: [
    ['Emitter (E) to GND.', 'الباعث (E) إلى GND.'],
    ['Base (B) through a 1 kΩ resistor to the output pin.', 'القاعدة (B) عبر مقاومة 1 كيلو أوم إلى طرف الإخراج.'],
    ['Load (relay coil, motor…) between the supply (+5 V…) and the collector (C).', 'الحمل (ملف مرحّل، محرك…) بين التغذية (+5 فولت…) والمجمّع (C).'],
    ['Pin HIGH → transistor on → the load runs.', 'الطرف HIGH ← يعمل الترانزستور ← يشتغل الحمل.'],
  ],
  tips: [
    ['Never connect the base straight to a pin: always use the base resistor.', 'لا تصل القاعدة مباشرةً بالطرف: استخدم دائماً مقاومة القاعدة.'],
    ['Add a flyback diode across relays and motors.', 'أضف ثنائي حماية على المرحّلات والمحركات.'],
    ['Check the pinout: the 2N2222 is E-B-C, the BC547 is C-B-E (flat side facing you).', 'تحقق من ترتيب الأرجل: 2N2222 هو E-B-C و BC547 هو C-B-E (والوجه المسطح باتجاهك).'],
  ],
  pins: NPN_PINS,
  board: { B: ['D9 → 1 kΩ', 'GP15 → 1 kΩ'], E: GND },
};

const PNP: GuideEntry = {
  ar: 'ترانزستور PNP',
  what: ['A PNP transistor: it conducts from emitter (E) to collector (C) when the base (B) is pulled about 0.7 V below the emitter. It switches the positive side of a load.', 'ترانزستور PNP: يوصل من الباعث (E) إلى المجمّع (C) عندما تُسحب القاعدة (B) إلى جهد أقل من الباعث بنحو 0.7 فولت. يقطع الجهة الموجبة للحمل.'],
  uses: [['High-side switching (the load stays connected to GND).', 'القطع من الجهة العليا (يبقى الحمل متصلاً بالأرضي).'], ['Complementary pairs with NPN transistors.', 'الأزواج المتكاملة مع ترانزستورات NPN.']],
  steps: [
    ['Emitter (E) to the + supply.', 'الباعث (E) إلى التغذية الموجبة.'],
    ['Base (B) through a 1 kΩ resistor to the output pin.', 'القاعدة (B) عبر مقاومة 1 كيلو أوم إلى طرف الإخراج.'],
    ['Load between the collector (C) and GND.', 'الحمل بين المجمّع (C) و GND.'],
    ['Pin LOW → transistor on; pin HIGH → off.', 'الطرف LOW ← يعمل الترانزستور؛ والطرف HIGH ← يتوقف.'],
  ],
  tips: [['The emitter supply must not be higher than the pin voltage, otherwise the pin cannot switch it off.', 'يجب ألا يزيد جهد الباعث عن جهد الطرف، وإلا لن يستطيع الطرف إطفاءه.']],
  pins: {
    B: NPN_PINS.B,
    C: ['Collector: to the load (the other side of the load goes to GND).', 'المجمّع: إلى الحمل (والطرف الآخر للحمل إلى GND).'],
    E: ['Emitter: to the + supply.', 'الباعث: إلى التغذية الموجبة.'],
  },
  board: { B: ['D9 → 1 kΩ', 'GP15 → 1 kΩ'], E: ['5V', '3V3'] },
};

const NMOS_PINS: Record<string, L> = {
  G: ['Gate: the voltage here switches it (almost no current).', 'البوابة: الجهد عليها يتحكم بالتشغيل (بلا تيار تقريباً).'],
  D: ['Drain: to the load (the other side of the load goes to +).', 'المصرف: إلى الحمل (والطرف الآخر للحمل إلى الموجب).'],
  S: ['Source: to GND.', 'المصدر: إلى GND.'],
};

const NMOS: GuideEntry = {
  ar: 'ترانزستور MOSFET قناة N',
  what: ['A voltage-controlled switch: a voltage on the gate (G) lets current flow from drain (D) to source (S). The gate draws almost no current.', 'مفتاح يُتحكم به بالجهد: جهد على البوابة (G) يسمح بمرور التيار من المصرف (D) إلى المصدر (S). البوابة لا تسحب تياراً تقريباً.'],
  uses: [
    ['Switch motors, LED strips, pumps and solenoids.', 'تشغيل المحركات وأشرطة الـ LED والمضخات والملفات اللولبية.'],
    ['Control their power with PWM (analogWrite).', 'التحكم بقدرتها باستخدام PWM (analogWrite).'],
  ],
  steps: [
    ['Source (S) to GND.', 'المصدر (S) إلى GND.'],
    ['Gate (G) to the output pin, and a 10 kΩ resistor from gate to GND so it stays off at reset.', 'البوابة (G) إلى طرف الإخراج، ومقاومة 10 كيلو أوم من البوابة إلى GND لتبقى مطفأة عند إعادة التشغيل.'],
    ['Load between the supply and the drain (D).', 'الحمل بين التغذية والمصرف (D).'],
  ],
  tips: [
    ['Use a logic-level MOSFET (IRLZ44N) with 5 V and 3.3 V pins; standard ones need 10 V on the gate.', 'استخدم MOSFET بمستوى منطقي (IRLZ44N) مع أطراف 5 و 3.3 فولت؛ الأنواع العادية تحتاج 10 فولت على البوابة.'],
    ['Add a flyback diode across motors and coils.', 'أضف ثنائي حماية على المحركات والملفات.'],
  ],
  pins: NMOS_PINS,
  board: { G: ['D9', 'GP15'], S: GND },
};

const PMOS: GuideEntry = {
  ar: 'ترانزستور MOSFET قناة P',
  what: ['A P-channel MOSFET: it conducts from source (S) to drain (D) when the gate (G) is pulled below the source. It switches the positive side of a load.', 'ترانزستور MOSFET بقناة P: يوصل من المصدر (S) إلى المصرف (D) عندما تُسحب البوابة (G) إلى جهد أقل من المصدر. يقطع الجهة الموجبة للحمل.'],
  uses: [['High-side power switches.', 'مفاتيح القدرة من الجهة العليا.'], ['Reverse-polarity protection.', 'الحماية من عكس القطبية.']],
  steps: [
    ['Source (S) to the + supply, drain (D) to the load, the load to GND.', 'المصدر (S) إلى التغذية الموجبة، والمصرف (D) إلى الحمل، والحمل إلى GND.'],
    ['A 10 kΩ resistor from gate to source keeps it off.', 'مقاومة 10 كيلو أوم بين البوابة والمصدر تُبقيه مطفأً.'],
    ['Pull the gate LOW (directly, or with an NPN transistor) to switch it on.', 'اسحب البوابة إلى LOW (مباشرةً أو بترانزستور NPN) لتشغيله.'],
  ],
  tips: [['With a 12 V supply the gate must reach 12 V to switch off: drive it through an NPN transistor, not straight from a 5 V pin.', 'مع تغذية 12 فولت يجب أن يصل جهد البوابة إلى 12 فولت ليُطفأ: قُدها عبر ترانزستور NPN وليس مباشرة من طرف 5 فولت.']],
  pins: {
    G: NMOS_PINS.G,
    D: ['Drain: to the load (the other side of the load goes to GND).', 'المصرف: إلى الحمل (والطرف الآخر للحمل إلى GND).'],
    S: ['Source: to the + supply.', 'المصدر: إلى التغذية الموجبة.'],
  },
};

export const BASICS: Record<string, GuideEntry> = {
  'evlab.arduino-uno': UNO,
  'evlab.arduino-nano': NANO,
  'evlab.breadboard-half': BREADBOARD,
  'evlab.breadboard-full': { ...BREADBOARD, ar: 'لوحة تجارب كاملة' },
  'evlab.breadboard-mini': BREADBOARD_MINI,
  'evlab.ground': SYMBOL_GROUND,
  'evlab.net-label': NET_LABEL,
  'evlab.junction': JUNCTION,
  'evlab.battery-9v': BATTERY_9V,
  'evlab.battery-2aa': BATTERY_2AA,
  'evlab.bench-supply': BENCH_SUPPLY,
  'evlab.resistor': RESISTOR,
  'evlab.potentiometer': POTENTIOMETER,
  'evlab.slide-potentiometer': { ...POTENTIOMETER, ar: 'مقاومة متغيرة منزلقة', what: ['A potentiometer you slide instead of turn. The middle pin (SIG) gives a voltage between the two ends.', 'مقاومة متغيرة تُحرَّك بالانزلاق بدل الدوران. الطرف الأوسط (SIG) يعطي جهداً بين جهدَي الطرفين.'] },
  'evlab.photoresistor': PHOTORESISTOR,
  'evlab.ntc-thermistor': NTC,
  'evlab.diode-1n4007': DIODE,
  'evlab.diode-1n4148': DIODE_1N4148,
  'evlab.diode-1n5819': DIODE_SCHOTTKY,
  'evlab.zener': ZENER,
  'evlab.2n2222': { ...NPN, ar: 'ترانزستور NPN 2N2222' },
  'evlab.bc547': { ...NPN, ar: 'ترانزستور NPN BC547', what: ['A small-signal NPN transistor (up to 100 mA): a small base (B) current lets a larger current flow from collector (C) to emitter (E).', 'ترانزستور NPN للإشارات الصغيرة (حتى 100 ملي أمبير): تيار صغير في القاعدة (B) يسمح بتيار أكبر من المجمّع (C) إلى الباعث (E).'] },
  'evlab.2n3906': { ...PNP, ar: 'ترانزستور PNP 2N3906' },
  'evlab.2n7000': { ...NMOS, ar: 'MOSFET قناة N 2N7000', what: ['A small N-channel MOSFET (up to 200 mA): a voltage on the gate (G) lets current flow from drain (D) to source (S).', 'ترانزستور MOSFET صغير بقناة N (حتى 200 ملي أمبير): جهد على البوابة (G) يسمح بمرور التيار من المصرف (D) إلى المصدر (S).'] },
  'evlab.irlz44n': { ...NMOS, ar: 'MOSFET قناة N IRLZ44N' },
  'evlab.irf9540': { ...PMOS, ar: 'MOSFET قناة P IRF9540' },
};
