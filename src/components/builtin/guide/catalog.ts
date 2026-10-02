/**
 * Guide content: boards and parts that are drawn and wired but not simulated
 * yet. Shorter than the simulated parts: what the part is, what it is for and
 * the pins that need explaining. Board suggestions come from the pin roles
 * unless given here.
 */
import type { BoardPins, GuideEntry, L } from './types';

const GND: BoardPins = ['GND', 'GND'];
const NONE: BoardPins = ['', ''];
const A0: BoardPins = ['A0', 'GP26'];
const D2: BoardPins = ['D2', 'GP15'];

// ---------------------------------------------------------------- boards

const BOARD_STEPS_3V3: L = ['Its pins work at 3.3 V: 5 V signals need a level shifter or a divider.', 'أطرافها تعمل على 3.3 فولت: إشارات 5 فولت تحتاج محوّل مستوى أو مقسّم جهد.'];

const BOARDS: Record<string, GuideEntry> = {
  'evlab.arduino-mega': {
    ar: 'لوحة Arduino Mega 2560',
    what: ['A large Arduino with the ATmega2560: 54 digital pins (15 PWM), 16 analog inputs and 4 serial ports, 5 V logic.', 'لوحة Arduino كبيرة بالشريحة ATmega2560: فيها 54 طرفاً رقمياً (15 منها PWM) و 16 مدخلاً تماثلياً و 4 منافذ تسلسلية، بمنطق 5 فولت.'],
    uses: [['Projects with many inputs and outputs: 3D printers, robots, large displays.', 'المشاريع التي تحتاج مداخل ومخارج كثيرة: الطابعات ثلاثية الأبعاد، الروبوتات، الشاشات الكبيرة.']],
    tips: [['I2C is on pins 20 (SDA) and 21 (SCL), SPI on 50–53.', 'ناقل I2C على الطرفين 20 (SDA) و 21 (SCL)، وناقل SPI على 50–53.']],
  },
  'evlab.esp32-devkit-v1': {
    ar: 'لوحة ESP32 DevKit',
    what: ['A fast dual-core board with built-in Wi-Fi and Bluetooth, 3.3 V logic.', 'لوحة سريعة ثنائية النواة فيها Wi-Fi و Bluetooth مدمجان، بمنطق 3.3 فولت.'],
    uses: [['Internet of Things: send sensor data to the web, control devices from a phone.', 'إنترنت الأشياء: إرسال بيانات الحساسات إلى الإنترنت والتحكم بالأجهزة من الهاتف.']],
    tips: [BOARD_STEPS_3V3],
  },
  'evlab.nano-rp2040-connect': {
    ar: 'لوحة Arduino Nano RP2040 Connect',
    what: ['An RP2040 board in the Nano size with Wi-Fi/Bluetooth and a motion sensor, 3.3 V logic.', 'لوحة RP2040 بحجم Nano فيها Wi-Fi و Bluetooth وحساس حركة، بمنطق 3.3 فولت.'],
    uses: [['Connected projects in a small size; runs Arduino or MicroPython.', 'مشاريع متصلة بالإنترنت بحجم صغير؛ تعمل بـ Arduino أو MicroPython.']],
    tips: [BOARD_STEPS_3V3],
  },
  'evlab.rpi-pico': {
    ar: 'لوحة Raspberry Pi Pico',
    what: ['A low-cost board with the RP2040 chip (two Cortex-M0+ cores at 133 MHz), 26 GPIO pins and 3.3 V logic. It runs C/C++ and MicroPython.', 'لوحة منخفضة التكلفة بالشريحة RP2040 (نواتان Cortex-M0+ بتردد 133 ميغاهيرتز) فيها 26 طرف GPIO ومنطق 3.3 فولت. تعمل بلغة C/C++ و MicroPython.'],
    uses: [['Learn Python on a microcontroller (MicroPython).', 'تعلّم بايثون على متحكم دقيق (MicroPython).'], ['Fast I/O, PWM on every pin, three analog inputs (GP26–GP28).', 'دخل/خرج سريع، و PWM على كل الأطراف، وثلاثة مداخل تماثلية (GP26–GP28).']],
    tips: [BOARD_STEPS_3V3, ['The on-board LED is on GP25.', 'الـ LED المدمج على الطرف GP25.']],
    pins: {
      '3V3': ['3.3 V output for sensors and modules.', 'خرج 3.3 فولت للحساسات والوحدات.'],
      VBUS: ['5 V from USB.', '5 فولت من USB.'],
      VSYS: ['Main supply input, 1.8–5.5 V.', 'دخل التغذية الرئيسي، من 1.8 إلى 5.5 فولت.'],
      GND: ['Ground.', 'الأرضي.'],
      GP26: ['GPIO, analog input ADC0.', 'GPIO، مدخل تماثلي ADC0.'],
      GP27: ['GPIO, analog input ADC1.', 'GPIO، مدخل تماثلي ADC1.'],
      GP28: ['GPIO, analog input ADC2.', 'GPIO، مدخل تماثلي ADC2.'],
      RUN: ['Pull LOW to reset.', 'اسحبه إلى LOW لإعادة التشغيل.'],
      '3V3_EN': ['Pull LOW to switch the 3.3 V regulator off.', 'اسحبه إلى LOW لإطفاء منظّم 3.3 فولت.'],
      ADC_VREF: ['Reference voltage of the ADC.', 'الجهد المرجعي لمحوّل ADC.'],
      AGND: ['Analog ground.', 'الأرضي التماثلي.'],
    },
  },
  'evlab.stm32-bluepill': {
    ar: 'لوحة STM32 Blue Pill',
    what: ['A cheap STM32F103 board (Cortex-M3, 72 MHz) with 3.3 V logic; many pins tolerate 5 V.', 'لوحة رخيصة بالشريحة STM32F103 (Cortex-M3 بتردد 72 ميغاهيرتز) بمنطق 3.3 فولت؛ كثير من أطرافها يتحمّل 5 فولت.'],
    uses: [['Learn ARM microcontrollers and faster projects than an Uno.', 'تعلّم متحكمات ARM والمشاريع الأسرع من Uno.']],
  },
  'evlab.stm32-blackpill': {
    ar: 'لوحة STM32 Black Pill',
    what: ['An STM32F411 board (Cortex-M4F, 100 MHz, floating-point unit) with USB-C.', 'لوحة بالشريحة STM32F411 (Cortex-M4F بتردد 100 ميغاهيرتز مع وحدة الفاصلة العائمة) ومنفذ USB-C.'],
    uses: [['Signal processing, audio and fast control loops.', 'معالجة الإشارات والصوت وحلقات التحكم السريعة.']],
    tips: [BOARD_STEPS_3V3],
  },
  'evlab.nodemcu-esp8266': {
    ar: 'لوحة NodeMCU ESP8266',
    what: ['An ESP8266 Wi-Fi board, 3.3 V logic, with one analog input.', 'لوحة Wi-Fi بالشريحة ESP8266، بمنطق 3.3 فولت ومدخل تماثلي واحد.'],
    uses: [['Simple Wi-Fi projects: web servers, sensors that report online.', 'مشاريع Wi-Fi بسيطة: خوادم ويب، حساسات ترسل قراءاتها عبر الإنترنت.']],
    tips: [BOARD_STEPS_3V3],
  },
  'evlab.esp32-c3-devkitm': {
    ar: 'لوحة ESP32-C3',
    what: ['A single-core RISC-V board with Wi-Fi and Bluetooth LE 5, 3.3 V logic.', 'لوحة RISC-V أحادية النواة فيها Wi-Fi و Bluetooth LE 5، بمنطق 3.3 فولت.'],
    uses: [['Low-cost connected devices.', 'أجهزة متصلة منخفضة التكلفة.']],
    tips: [BOARD_STEPS_3V3],
  },
  'evlab.sifive-hifive1': {
    ar: 'لوحة SiFive HiFive1',
    what: ['A RISC-V (FE310) board in the Arduino Uno form factor.', 'لوحة RISC-V (FE310) بشكل لوحة Arduino Uno.'],
    uses: [['Learn the RISC-V architecture.', 'تعلّم معمارية RISC-V.']],
  },
  'evlab.attiny85': {
    ar: 'شريحة ATtiny85',
    what: ['A tiny 8-pin AVR microcontroller with 8 KB flash and 6 I/O pins (PB5 doubles as RESET).', 'متحكم AVR صغير جداً بثمانية أطراف، فيه 8 كيلوبايت ذاكرة و 6 أطراف إدخال/إخراج (PB5 هو أيضاً RESET).'],
    uses: [['Small, low-power gadgets once the prototype works.', 'الأجهزة الصغيرة قليلة الاستهلاك بعد نجاح النموذج الأولي.']],
    pins: { VCC: ['Supply, 2.7–5.5 V.', 'التغذية، من 2.7 إلى 5.5 فولت.'], GND: ['Ground.', 'الأرضي.'], PB5: ['I/O or RESET.', 'دخل/خرج أو RESET.'] },
    board: null,
  },
  'evlab.atmega328p-dip': {
    ar: 'شريحة ATmega328P',
    what: ['The chip of the Arduino Uno on its own, for building an Arduino on a breadboard.', 'شريحة Arduino Uno وحدها، لبناء Arduino على لوحة التجارب.'],
    uses: [['Permanent projects without a whole Uno board.', 'المشاريع الدائمة دون لوحة Uno كاملة.']],
    tips: [['It needs a 16 MHz crystal with two 22 pF capacitors, a 10 kΩ pull-up on RESET and VCC/AVCC/GND connected.', 'تحتاج بلورة 16 ميغاهيرتز مع متسعتين 22 بيكوفاراد، ومقاومة رفع 10 كيلو أوم على RESET، وتوصيل VCC و AVCC و GND.']],
    board: null,
  },
};

// ---------------------------------------------------------------- power, passives, ICs

const PASSIVE_CATALOG: Record<string, GuideEntry> = {
  'evlab.lm7805': {
    ar: 'منظّم جهد LM7805',
    what: ['A linear regulator that turns 7–25 V into a steady 5 V (up to 1.5 A).', 'منظّم خطي يحوّل جهداً من 7 إلى 25 فولت إلى 5 فولت ثابتة (حتى 1.5 أمبير).'],
    uses: [['Make 5 V from a 9 V or 12 V battery or adapter.', 'الحصول على 5 فولت من بطارية أو محوّل 9 أو 12 فولت.']],
    tips: [['Put a 0.33 µF capacitor on IN and 0.1 µF on OUT; it gets hot with large currents.', 'ضع متسعة 0.33 ميكروفاراد على IN و 0.1 ميكروفاراد على OUT؛ يسخن مع التيارات الكبيرة.']],
    pins: { IN: ['Input, 7–25 V.', 'الدخل، من 7 إلى 25 فولت.'], OUT: ['5 V output.', 'خرج 5 فولت.'], GND: ['Ground.', 'الأرضي.'] },
    board: null,
  },
  'evlab.ams1117-33': {
    ar: 'منظّم جهد AMS1117-3.3',
    what: ['A low-dropout regulator that makes 3.3 V (up to 1 A) from about 4.5–12 V.', 'منظّم بفرق جهد منخفض يعطي 3.3 فولت (حتى 1 أمبير) من نحو 4.5 إلى 12 فولت.'],
    uses: [['Power 3.3 V modules from a 5 V supply.', 'تغذية وحدات 3.3 فولت من مصدر 5 فولت.']],
    pins: { IN: ['Input.', 'الدخل.'], OUT: ['3.3 V output.', 'خرج 3.3 فولت.'], GND: ['Ground.', 'الأرضي.'] },
    board: null,
  },
  'evlab.capacitor-ceramic': {
    ar: 'متسعة سيراميكية',
    what: ['A small capacitor without polarity that stores a little charge (e.g. 100 nF).', 'متسعة صغيرة بلا قطبية تخزن شحنة قليلة (مثلاً 100 نانوفاراد).'],
    uses: [['Decoupling: 100 nF between VCC and GND next to every chip.', 'إزالة التشويش: 100 نانوفاراد بين VCC و GND قرب كل شريحة.'], ['Filters and timing.', 'المرشحات والتوقيت.']],
    board: null,
  },
  'evlab.capacitor-electrolytic': {
    ar: 'متسعة إلكتروليتية',
    what: ['A large capacitor with polarity (the stripe marks −) that smooths supplies.', 'متسعة كبيرة لها قطبية (الشريط يدل على −) تُنعّم جهد التغذية.'],
    uses: [['Smooth the supply of motors, servos and LED strips.', 'تنعيم تغذية المحركات والسيرفو وأشرطة LED.'], ['Long time delays with a resistor.', 'التأخيرات الزمنية الطويلة مع مقاومة.']],
    tips: [['Reversed or over-voltage it can burst: check the − stripe and the voltage rating.', 'إذا رُكّبت معكوسة أو بجهد زائد قد تنفجر: تحقق من شريط − ومن الجهد المقنن.']],
    board: null,
  },
  'evlab.inductor': {
    ar: 'ملف (محاثة)',
    what: ['A coil of wire that resists changes in current.', 'سلك ملفوف يقاوم التغيرات في التيار.'],
    uses: [['Switching power supplies and filters.', 'مزوّدات الطاقة التبديلية والمرشحات.']],
    board: null,
  },
  'evlab.pc817': {
    ar: 'عازل ضوئي PC817',
    what: ['An LED (pins A, K) shining on a phototransistor (C, E) inside one package: it passes a signal without an electrical connection.', 'LED (الطرفان A و K) يضيء على ترانزستور ضوئي (C و E) داخل غلاف واحد: يمرر الإشارة دون توصيل كهربائي.'],
    uses: [['Isolate a board from another circuit (relays, mains detection, PLC inputs).', 'عزل اللوحة عن دائرة أخرى (المرحّلات، كشف التيار الرئيسي، مداخل PLC).']],
    pins: { A: ['LED anode (through a resistor).', 'مصعد الـ LED (عبر مقاومة).'], K: ['LED cathode.', 'مهبط الـ LED.'], C: ['Transistor collector.', 'مجمّع الترانزستور.'], E: ['Transistor emitter.', 'باعث الترانزستور.'] },
    board: { A: ['D7 → 330 Ω', 'GP15 → 330 Ω'], K: GND },
  },
  'evlab.crystal': {
    ar: 'بلورة كوارتز 16 ميغاهيرتز',
    what: ['A quartz crystal that sets a precise clock frequency for a microcontroller.', 'بلورة كوارتز تحدد تردد ساعة دقيقاً للمتحكم.'],
    uses: [['The clock of a stand-alone ATmega328P (with two 22 pF capacitors).', 'ساعة شريحة ATmega328P المستقلة (مع متسعتين 22 بيكوفاراد).']],
    board: null,
  },
  'evlab.74hc165': {
    ar: 'سجل إزاحة 74HC165',
    what: ['Reads eight inputs (A–H) and sends them to the board one bit at a time: the opposite of the 74HC595.', 'يقرأ ثمانية مداخل (A–H) ويرسلها إلى اللوحة بتاً بعد بت: عكس 74HC595.'],
    uses: [['Read many buttons or switches with three pins.', 'قراءة أزرار أو مفاتيح كثيرة بثلاثة أطراف.']],
    board: { 'SH/LD': ['D8', 'GP17'], CLK: ['D13', 'GP18'], QH: ['D12', 'GP16'], CLKINH: GND },
  },
  'evlab.cd4017': {
    ar: 'عدّاد عشري CD4017',
    what: ['A counter with ten outputs: each clock pulse moves a HIGH output from Q0 to the next one.', 'عدّاد بعشرة مخارج: كل نبضة ساعة تنقل الخرج HIGH من Q0 إلى الخرج التالي.'],
    uses: [['Running lights and sequencers (often with a 555 timer).', 'الأضواء المتتابعة والمتسلسلات (غالباً مع المؤقت 555).']],
    board: null,
  },
  'evlab.74hc4051': {
    ar: 'مجمّع تماثلي 74HC4051',
    what: ['An 8-channel analog switch: S0–S2 choose which of Y0–Y7 is connected to Z.', 'مفتاح تماثلي بثمانية قنوات: تختار S0–S2 أي من Y0–Y7 يتصل بـ Z.'],
    uses: [['Read eight analog sensors with one analog input.', 'قراءة ثمانية حساسات تماثلية بمدخل تماثلي واحد.']],
    board: { Z: A0, S0: ['D2', 'GP2'], S1: ['D3', 'GP3'], S2: ['D4', 'GP4'], E: GND, VEE: GND },
  },
  'evlab.ne555': {
    ar: 'مؤقت NE555',
    what: ['The classic timer chip: it makes pulses (astable) or a single delay (monostable) set by resistors and a capacitor.', 'شريحة المؤقت الكلاسيكية: تولّد نبضات متكررة (غير مستقر) أو تأخيراً واحداً (أحادي الاستقرار) تحدده مقاومات ومتسعة.'],
    uses: [['Blinkers, tone generators, PWM and delays without a microcontroller.', 'الوامضات ومولّدات النغمات والـ PWM والتأخيرات بدون متحكم.']],
    board: null,
  },
  'evlab.lm358': {
    ar: 'مكبّر عمليات مزدوج LM358',
    what: ['Two operational amplifiers that work from a single supply.', 'مكبّرا عمليات يعملان من مصدر تغذية واحد.'],
    uses: [['Amplify small sensor signals, active filters, buffers.', 'تكبير إشارات الحساسات الصغيرة، المرشحات الفعالة، العوازل.']],
    board: null,
  },
  'evlab.lm393': {
    ar: 'مقارن مزدوج LM393',
    what: ['Two voltage comparators: the output switches when IN+ goes above IN−. Open-collector outputs need a pull-up.', 'مقارنا جهد: يتبدّل الخرج عندما يتجاوز IN+ جهد IN−. المخارج بمجمّع مفتوح وتحتاج مقاومة رفع.'],
    uses: [['Threshold detectors, as on most sensor modules.', 'كاشفات العتبة، كما في معظم وحدات الحساسات.']],
    board: null,
  },
  'evlab.l293d': {
    ar: 'مشغّل محركات L293D',
    what: ['Four half H-bridges (600 mA each): drives two DC motors in both directions or one stepper.', 'أربعة أنصاف جسور H (600 ملي أمبير لكل منها): يشغّل محركي تيار مستمر بالاتجاهين أو محركاً خطوياً واحداً.'],
    uses: [['Small robot cars and motor shields.', 'سيارات الروبوت الصغيرة ودروع المحركات.']],
    pins: { VCC1: ['Logic supply, 5 V.', 'تغذية المنطق، 5 فولت.'], VCC2: ['Motor supply, 4.5–36 V.', 'تغذية المحركات، من 4.5 إلى 36 فولت.'] },
    board: { 'EN1,2': ['D9', 'GP15'], '1A': ['D8', 'GP14'], '2A': ['D7', 'GP13'], VCC1: ['5V', 'VBUS'], GND, VCC2: NONE },
  },
};

// ---------------------------------------------------------------- sensors and modules

const SENSORS: Record<string, GuideEntry> = {
  'evlab.max7219-matrix': { ar: 'مصفوفة LED 8×8 مع MAX7219', what: ['An 8×8 red LED matrix with its MAX7219 driver: three data pins control 64 LEDs.', 'مصفوفة LED حمراء 8×8 مع مشغّلها MAX7219: ثلاثة أطراف بيانات تتحكم بـ 64 LED.'], uses: [['Scrolling text, icons and simple games.', 'النصوص المتحركة والأيقونات والألعاب البسيطة.']], board: { DIN: ['D11', 'GP19'], CLK: ['D13', 'GP18'], CS: ['D10', 'GP17'] } },
  'evlab.ili9341': { ar: 'شاشة TFT ملونة 2.8 بوصة', what: ['A 2.8-inch 240×320 colour display with the ILI9341 controller over SPI.', 'شاشة ملونة 240×320 بالمتحكم ILI9341 عبر ناقل SPI.'], uses: [['Graphical interfaces, images and charts.', 'الواجهات الرسومية والصور والرسوم البيانية.']], board: { 'D/C': ['D9', 'GP20'], RST: ['D8', 'GP21'], LED: ['3.3V', '3V3'] } },
  'evlab.bme280': { ar: 'حساس BME280', what: ['Measures air pressure, humidity and temperature accurately (I2C).', 'يقيس ضغط الهواء والرطوبة والحرارة بدقة (I2C).'], uses: [['Weather stations and altitude estimation.', 'محطات الطقس وتقدير الارتفاع.']] },
  'evlab.bmp180': { ar: 'حساس الضغط BMP180', what: ['Measures air pressure and temperature (I2C).', 'يقيس ضغط الهواء والحرارة (I2C).'], uses: [['Barometers and altitude estimation.', 'مقاييس الضغط الجوي وتقدير الارتفاع.']] },
  'evlab.ds18b20': { ar: 'حساس حرارة DS18B20', what: ['A waterproof digital thermometer on a 1-Wire bus: several sensors can share one pin.', 'مقياس حرارة رقمي مقاوم للماء على ناقل 1-Wire: يمكن لعدة حساسات مشاركة طرف واحد.'], uses: [['Liquids, aquariums and outdoor temperature.', 'حرارة السوائل وأحواض الأسماك والجو الخارجي.']], tips: [['DQ needs a 4.7 kΩ pull-up to VCC.', 'يحتاج DQ مقاومة رفع 4.7 كيلو أوم إلى VCC.']], board: { DQ: D2 } },
  'evlab.lm35': { ar: 'حساس حرارة LM35', what: ['An analog temperature sensor: its output rises 10 mV per °C.', 'حساس حرارة تماثلي: يرتفع خرجه 10 ملي فولت لكل درجة مئوية.'], uses: [['Simple temperature readings: °C = voltage × 100.', 'قراءات حرارة بسيطة: الحرارة = الجهد × 100.']], board: { OUT: A0 } },
  'evlab.bh1750': { ar: 'حساس الإضاءة BH1750', what: ['A digital light sensor that reports lux directly (I2C).', 'حساس ضوء رقمي يعطي شدة الإضاءة باللوكس مباشرة (I2C).'], uses: [['Automatic screen brightness and light measurement.', 'سطوع الشاشة التلقائي وقياس الإضاءة.']], board: { ADDR: GND } },
  'evlab.mq135': { ar: 'حساس جودة الهواء MQ-135', what: ['Senses air pollutants (CO₂, ammonia, smoke). AO rises with the level; DO switches at a threshold.', 'يتحسس ملوثات الهواء (ثاني أكسيد الكربون، الأمونيا، الدخان). يرتفع AO مع المستوى ويتبدّل DO عند عتبة.'], uses: [['Air quality monitors.', 'أجهزة مراقبة جودة الهواء.']], board: { AO: A0, DO: D2 } },
  'evlab.vl53l0x': { ar: 'حساس المسافة الليزري VL53L0X', what: ['Measures distance up to about 2 m with a laser time-of-flight sensor (I2C).', 'يقيس المسافة حتى نحو 2 متر بحساس زمن الطيران الليزري (I2C).'], uses: [['Accurate distance for robots and gesture detection.', 'مسافة دقيقة للروبوتات وكشف الإيماءات.']] },
  'evlab.sharp-gp2y0a21': { ar: 'حساس المسافة بالأشعة تحت الحمراء Sharp', what: ['An infrared distance sensor (10–80 cm) with an analog output.', 'حساس مسافة بالأشعة تحت الحمراء (10–80 سم) بخرج تماثلي.'], uses: [['Obstacle detection for robots.', 'كشف العوائق للروبوتات.']], board: { VO: A0 } },
  'evlab.a3144': { ar: 'حساس هول A3144', what: ['A magnetic switch: OUT goes LOW when a magnet’s south pole is near.', 'مفتاح مغناطيسي: يصبح OUT بحالة LOW عندما يقترب القطب الجنوبي لمغناطيس.'], uses: [['Count wheel turns, detect doors and positions.', 'عدّ دورات العجلة، كشف الأبواب والمواضع.']], tips: [['OUT needs a 10 kΩ pull-up (or `INPUT_PULLUP`).', 'يحتاج OUT مقاومة رفع 10 كيلو أوم (أو `INPUT_PULLUP`).']], board: { OUT: D2 } },
  'evlab.acs712': { ar: 'حساس التيار ACS712', what: ['Measures current through it with a Hall sensor; the output is 2.5 V at 0 A and changes 185 mV per amp (5 A version).', 'يقيس التيار المار خلاله بحساس هول؛ الخرج 2.5 فولت عند صفر أمبير ويتغير 185 ملي فولت لكل أمبير (نسخة 5 أمبير).'], uses: [['Measure the current of motors and loads.', 'قياس تيار المحركات والأحمال.']], board: { OUT: A0 } },
  'evlab.ina219': { ar: 'حساس التيار والقدرة INA219', what: ['Measures the current, voltage and power of a load on the high side (I2C).', 'يقيس تيار الحمل وجهده وقدرته من الجهة العليا (I2C).'], uses: [['Battery and solar panel monitors.', 'مراقبة البطاريات والألواح الشمسية.']], pins: { 'VIN+': ['From the supply.', 'من التغذية.'], 'VIN-': ['To the load.', 'إلى الحمل.'] } },
  'evlab.voltage-sensor': { ar: 'وحدة حساس الجهد', what: ['A 5:1 resistor divider: measure up to 25 V with a 5 V analog input.', 'مقسّم جهد بنسبة 5:1: لقياس حتى 25 فولت بمدخل تماثلي 5 فولت.'], uses: [['Measure battery voltage.', 'قياس جهد البطارية.']], board: { S: A0, '-': GND, '+': NONE } },
  'evlab.hx711': { ar: 'مضخّم خلية الوزن HX711', what: ['A precise 24-bit converter for load cells (scales).', 'محوّل دقيق 24 بت لخلايا الوزن (الموازين).'], uses: [['Kitchen scales and force measurement.', 'موازين المطبخ وقياس القوة.']], board: { DT: ['D3', 'GP14'], SCK: ['D2', 'GP15'] } },
  'evlab.pulse-sensor': { ar: 'حساس نبض القلب', what: ['An optical heart-rate sensor with an analog output.', 'حساس ضوئي لنبض القلب بخرج تماثلي.'], uses: [['Heart-rate displays and biofeedback projects.', 'عرض معدل النبض ومشاريع الاستجابة الحيوية.']], board: { OUT: A0 } },
  'evlab.rotary-dialer': { ar: 'قرص هاتف دوّار', what: ['An old telephone dial: it makes one pulse per number while returning.', 'قرص هاتف قديم: يولّد نبضة لكل رقم أثناء عودته.'], uses: [['Retro input devices.', 'أجهزة إدخال بطابع قديم.']], board: { DIAL: ['D2', 'GP14'], PULSE: ['D3', 'GP15'] } },
  'evlab.microsd': { ar: 'وحدة بطاقة microSD', what: ['Reads and writes a microSD card over SPI.', 'تقرأ بطاقة microSD وتكتب عليها عبر ناقل SPI.'], uses: [['Data logging and storing files.', 'تسجيل البيانات وحفظ الملفات.']] },
  'evlab.biaxial-stepper': { ar: 'محرك خطوي ثنائي المحور', what: ['Two concentric stepper motors in one (for example the two hands of a clock).', 'محركان خطويان متحدا المحور في قطعة واحدة (مثل عقربي الساعة).'], uses: [['Clocks and gauges.', 'الساعات ومؤشرات القياس.']], board: null },
  'evlab.solenoid': { ar: 'صمام لولبي', what: ['A 12 V electromagnet that opens a valve or pushes a plunger.', 'مغناطيس كهربائي 12 فولت يفتح صماماً أو يدفع ذراعاً.'], uses: [['Water valves and door locks.', 'صمامات المياه وأقفال الأبواب.']], tips: [['Drive it with a MOSFET and a flyback diode, never from a pin.', 'شغّله بترانزستور MOSFET مع ثنائي حماية، وليس من الطرف مباشرة.']], board: null },
  'evlab.hc05': { ar: 'وحدة بلوتوث HC-05', what: ['A classic Bluetooth module that works as a wireless serial port (UART).', 'وحدة بلوتوث كلاسيكية تعمل كمنفذ تسلسلي لاسلكي (UART).'], uses: [['Control a project from a phone app.', 'التحكم بالمشروع من تطبيق على الهاتف.']], tips: [['RXD is 3.3 V: use a divider from a 5 V TX pin.', 'الطرف RXD يعمل على 3.3 فولت: استخدم مقسّم جهد من طرف TX بجهد 5 فولت.']] },
  'evlab.hm10': { ar: 'وحدة بلوتوث منخفض الطاقة HM-10', what: ['A Bluetooth Low Energy module with a serial (UART) interface.', 'وحدة بلوتوث منخفض الطاقة بواجهة تسلسلية (UART).'], uses: [['Phone apps and BLE sensors.', 'تطبيقات الهاتف وحساسات BLE.']] },
  'evlab.esp01': { ar: 'وحدة Wi-Fi ESP-01', what: ['A small ESP8266 Wi-Fi module controlled with AT commands over serial.', 'وحدة Wi-Fi صغيرة بالشريحة ESP8266 يُتحكم بها بأوامر AT عبر المنفذ التسلسلي.'], uses: [['Add Wi-Fi to an Uno.', 'إضافة Wi-Fi إلى Uno.']], tips: [['It runs at 3.3 V and draws up to 300 mA: do not power it from the Uno’s 3.3V pin.', 'تعمل على 3.3 فولت وتسحب حتى 300 ملي أمبير: لا تغذّها من طرف 3.3V في Uno.']] },
  'evlab.nrf24l01': { ar: 'وحدة راديو nRF24L01+', what: ['A 2.4 GHz radio transceiver for short-range links between boards (SPI).', 'وحدة إرسال واستقبال راديوية 2.4 غيغاهيرتز للربط قصير المدى بين اللوحات (SPI).'], uses: [['Remote controls and wireless sensor networks.', 'أجهزة التحكم عن بعد وشبكات الحساسات اللاسلكية.']], tips: [['VCC is 3.3 V only; add a 10 µF capacitor on its supply.', 'الطرف VCC يعمل على 3.3 فولت فقط؛ أضف متسعة 10 ميكروفاراد على تغذيتها.']], board: { CE: ['D9', 'GP20'], IRQ: NONE } },
  'evlab.lora-sx1278': { ar: 'وحدة LoRa SX1278', what: ['A long-range, low-power 433 MHz radio (several km in open air), SPI.', 'راديو بعيد المدى قليل الاستهلاك بتردد 433 ميغاهيرتز (عدة كيلومترات في الأماكن المفتوحة)، SPI.'], uses: [['Farm sensors and remote telemetry.', 'حساسات المزارع والقياس عن بعد.']], board: { RST: ['D9', 'GP20'], DIO0: ['D2', 'GP21'] } },
  'evlab.rc522': { ar: 'قارئ RFID RC522', what: ['Reads and writes 13.56 MHz RFID cards and tags (SPI).', 'يقرأ بطاقات وشارات RFID بتردد 13.56 ميغاهيرتز ويكتب عليها (SPI).'], uses: [['Door access and attendance systems.', 'أنظمة الدخول والحضور.']], tips: [['Its SDA pin is the SPI chip select. Power it from 3.3 V.', 'الطرف SDA فيه هو اختيار الشريحة لناقل SPI. غذّه من 3.3 فولت.']], board: { SDA: ['D10', 'GP17'], RST: ['D9', 'GP20'], IRQ: NONE } },
  'evlab.pn532': { ar: 'وحدة NFC PN532', what: ['An NFC reader that also talks to phones (I2C here).', 'قارئ NFC يتواصل أيضاً مع الهواتف (عبر I2C هنا).'], uses: [['NFC tags, cards and phone tapping.', 'شارات وبطاقات NFC والتلامس مع الهاتف.']] },
  'evlab.neo6m': { ar: 'وحدة GPS NEO-6M', what: ['A GPS receiver that streams position and time as NMEA text over serial (9600 baud).', 'مستقبل GPS يرسل الموقع والوقت كنصوص NMEA عبر المنفذ التسلسلي (9600 باود).'], uses: [['Trackers, clocks and navigation.', 'أجهزة التتبع والساعات والملاحة.']] },
  'evlab.sim800l': { ar: 'وحدة GSM SIM800L', what: ['A GSM/GPRS modem: send SMS and make calls with AT commands over serial.', 'مودم GSM/GPRS: إرسال الرسائل وإجراء المكالمات بأوامر AT عبر المنفذ التسلسلي.'], uses: [['SMS alarms and remote control.', 'إنذارات بالرسائل والتحكم عن بعد.']], tips: [['It needs 3.7–4.2 V and up to 2 A peaks: use a Li-ion cell or a strong regulator.', 'تحتاج من 3.7 إلى 4.2 فولت وتيارات ذروة حتى 2 أمبير: استخدم بطارية ليثيوم أو منظّماً قوياً.']] },
  'evlab.mcp2515': { ar: 'وحدة CAN MCP2515', what: ['A CAN bus controller with transceiver (SPI): talks to cars and industrial devices.', 'متحكم ناقل CAN مع مرسل/مستقبل (SPI): يتواصل مع السيارات والأجهزة الصناعية.'], uses: [['Read car data, industrial networks.', 'قراءة بيانات السيارة، الشبكات الصناعية.']], board: { INT: D2 } },
  'evlab.max485': { ar: 'وحدة RS-485 MAX485', what: ['Turns a serial port into a long-distance RS-485 line (up to about 1 km).', 'تحوّل المنفذ التسلسلي إلى خط RS-485 لمسافات طويلة (حتى نحو 1 كم).'], uses: [['Modbus and industrial sensors.', 'بروتوكول Modbus والحساسات الصناعية.']], board: { RO: ['D0 (RX)', 'GP1 (RX)'], DI: ['D1 (TX)', 'GP0 (TX)'], RE: ['D2', 'GP2'], DE: ['D2', 'GP2'], A: NONE, B: NONE } },
  'evlab.max3232': { ar: 'وحدة RS-232 MAX3232', what: ['Converts board serial levels to RS-232 levels (±12 V) for PCs and instruments.', 'تحوّل مستويات المنفذ التسلسلي للوحة إلى مستويات RS-232 (±12 فولت) للحواسيب والأجهزة.'], uses: [['Connect to old PCs, PLCs and lab instruments.', 'الربط مع الحواسيب القديمة و PLC وأجهزة المختبر.']] },
  'evlab.ch340': { ar: 'محوّل USB إلى تسلسلي CH340', what: ['A USB to serial (TTL) adapter.', 'محوّل من USB إلى منفذ تسلسلي (TTL).'], uses: [['Program boards without USB and read their serial output.', 'برمجة اللوحات التي لا تملك USB وقراءة مخرجها التسلسلي.']], board: { DTR: NONE, CTS: NONE } },
  'evlab.level-shifter': { ar: 'محوّل مستوى المنطق', what: ['Translates signals between 3.3 V (LV side) and 5 V (HV side) in both directions.', 'يحوّل الإشارات بين 3.3 فولت (جهة LV) و 5 فولت (جهة HV) بالاتجاهين.'], uses: [['Connect 3.3 V modules to a 5 V board, and the reverse.', 'ربط وحدات 3.3 فولت بلوحة 5 فولت، والعكس.']], pins: { LV: ['Low-side supply, 3.3 V.', 'تغذية الجهة المنخفضة، 3.3 فولت.'], HV: ['High-side supply, 5 V.', 'تغذية الجهة العالية، 5 فولت.'] }, board: { LV: ['3.3V', '3V3'], HV: ['5V', 'VBUS'] } },
  'evlab.pcf8574': { ar: 'موسّع المنافذ PCF8574', what: ['Adds eight digital inputs/outputs over I2C.', 'يضيف ثمانية مداخل/مخارج رقمية عبر I2C.'], uses: [['More pins for buttons and LEDs; the backpack of I2C LCDs.', 'أطراف إضافية للأزرار والـ LED؛ وهو اللوحة الخلفية لشاشات LCD بواجهة I2C.']], board: { INT: NONE } },
  'evlab.ads1115': { ar: 'محوّل تماثلي رقمي ADS1115', what: ['A precise 16-bit analog-to-digital converter with four inputs (I2C).', 'محوّل تماثلي إلى رقمي دقيق 16 بت بأربعة مداخل (I2C).'], uses: [['Accurate voltage and sensor measurements.', 'قياسات دقيقة للجهد والحساسات.']], board: { ADDR: GND, ALRT: NONE, A0: NONE } },
  'evlab.mcp4725': { ar: 'محوّل رقمي تماثلي MCP4725', what: ['A 12-bit digital-to-analog converter: outputs a real voltage set over I2C.', 'محوّل رقمي إلى تماثلي 12 بت: يُخرج جهداً حقيقياً يُضبط عبر I2C.'], uses: [['Generate voltages and simple waveforms.', 'توليد الجهود والموجات البسيطة.']] },
  'evlab.w25q': { ar: 'ذاكرة فلاش W25Q32', what: ['A 4 MB SPI flash memory chip.', 'شريحة ذاكرة فلاش 4 ميغابايت عبر SPI.'], uses: [['Store data, fonts and images.', 'تخزين البيانات والخطوط والصور.']], board: { WP: ['3.3V', '3V3'], HOLD: ['3.3V', '3V3'] } },
  'evlab.at24c256': { ar: 'ذاكرة EEPROM AT24C256', what: ['A 32 KB I2C memory that keeps its data without power.', 'ذاكرة I2C بسعة 32 كيلوبايت تحتفظ ببياناتها دون تغذية.'], uses: [['Save settings and logs.', 'حفظ الإعدادات والسجلات.']], board: { A0: GND, A1: GND, A2: GND, WP: GND } },
};

export const CATALOG: Record<string, GuideEntry> = { ...BOARDS, ...PASSIVE_CATALOG, ...SENSORS };
