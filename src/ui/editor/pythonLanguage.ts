/**
 * MicroPython completions and hover documentation for Monaco (Raspberry Pi
 * Pico): the `machine` classes, `time` and `neopixel`, in English and Arabic.
 * Variables assigned from a constructor (`led = Pin(25, Pin.OUT)`) are
 * recognised, so `led.` offers the methods of a Pin.
 */
import type * as Monaco from 'monaco-editor';
import { getLanguage } from '../../i18n';

interface PyEntry {
  /** `module`, `module.member`, `Class` or `Class.member`. */
  name: string;
  signature: string;
  doc: [en: string, ar: string];
  snippet?: string;
  kind: 'module' | 'class' | 'function' | 'method' | 'constant';
}

const API: PyEntry[] = [
  // ------------------------------------------------------------------ modules
  { name: 'machine', kind: 'module', signature: 'import machine', doc: ['Hardware of the board: pins, PWM, ADC, I2C, SPI, UART and timers.', 'عتاد اللوحة: الأطراف و PWM و ADC و I2C و SPI و UART والمؤقتات.'] },
  { name: 'time', kind: 'module', signature: 'import time', doc: ['Delays and time measurement.', 'التأخير وقياس الزمن.'] },
  { name: 'neopixel', kind: 'module', signature: 'import neopixel', doc: ['Driver for WS2812 (NeoPixel) RGB LEDs.', 'مشغّل ثنائيات RGB من نوع WS2812 (NeoPixel).'] },
  { name: 'machine.Pin', kind: 'class', signature: 'Pin(id, mode=-1, pull=-1, *, value)', doc: ['A GPIO pin. `Pin(25, Pin.OUT)` is the on-board LED; `Pin(14, Pin.IN, Pin.PULL_UP)` reads a button to GND.', 'طرف GPIO. `Pin(25, Pin.OUT)` هو الثنائي الضوئي على اللوحة، و`Pin(14, Pin.IN, Pin.PULL_UP)` يقرأ زراً موصولاً إلى GND.'], snippet: 'Pin(${1:25}, Pin.${2|OUT,IN|})' },
  { name: 'machine.PWM', kind: 'class', signature: 'PWM(pin, *, freq, duty_u16)', doc: ['Pulse-width modulation on a pin: LED brightness, motor speed, servo angle.', 'تعديل عرض النبضة على طرف: سطوع الثنائي الضوئي أو سرعة المحرك أو زاوية السيرفو.'], snippet: 'PWM(Pin(${1:15}), freq=${2:1000})' },
  { name: 'machine.ADC', kind: 'class', signature: 'ADC(pin)', doc: ['Analog input on GP26, GP27 or GP28 (ADC0–ADC2), 0–3.3 V.', 'دخل تماثلي على GP26 أو GP27 أو GP28 (ADC0–ADC2)، من 0 إلى 3.3 V.'], snippet: 'ADC(${1:26})' },
  { name: 'machine.I2C', kind: 'class', signature: 'I2C(id, *, scl, sda, freq=400000)', doc: ['Hardware I2C bus 0 or 1, e.g. `I2C(0, sda=Pin(4), scl=Pin(5))`.', 'ناقل I2C عتادي رقم 0 أو 1، مثلاً `I2C(0, sda=Pin(4), scl=Pin(5))`.'], snippet: 'I2C(${1:0}, sda=Pin(${2:4}), scl=Pin(${3:5}), freq=${4:400000})' },
  { name: 'machine.SoftI2C', kind: 'class', signature: 'SoftI2C(scl, sda, *, freq=400000)', doc: ['I2C on any two pins, driven by software.', 'ناقل I2C على أي طرفين، يُدار برمجياً.'], snippet: 'SoftI2C(scl=Pin(${1:5}), sda=Pin(${2:4}))' },
  { name: 'machine.SPI', kind: 'class', signature: 'SPI(id, baudrate=1000000, *, sck, mosi, miso)', doc: ['Hardware SPI bus 0 or 1, e.g. `SPI(0, sck=Pin(18), mosi=Pin(19), miso=Pin(16))`. Drive the chip select yourself with a Pin.', 'ناقل SPI عتادي رقم 0 أو 1، مثلاً `SPI(0, sck=Pin(18), mosi=Pin(19), miso=Pin(16))`. تحكّم بطرف اختيار الشريحة (CS) بنفسك عبر Pin.'], snippet: 'SPI(${1:0}, baudrate=${2:1000000}, sck=Pin(${3:18}), mosi=Pin(${4:19}), miso=Pin(${5:16}))' },
  { name: 'machine.UART', kind: 'class', signature: 'UART(id, baudrate=115200, *, tx, rx)', doc: ['Serial port on pins, e.g. `UART(0, 9600, tx=Pin(0), rx=Pin(1))`. `print()` goes to USB instead.', 'منفذ تسلسلي على الأطراف، مثلاً `UART(0, 9600, tx=Pin(0), rx=Pin(1))`. أما `print()` فيذهب إلى USB.'], snippet: 'UART(${1:0}, ${2:9600}, tx=Pin(${3:0}), rx=Pin(${4:1}))' },
  { name: 'machine.Timer', kind: 'class', signature: 'Timer(*, mode=Timer.PERIODIC, freq, period, callback)', doc: ['Calls a function periodically (or once) without blocking the program.', 'يستدعي دالة بشكل دوري (أو مرة واحدة) دون إيقاف البرنامج.'], snippet: 'Timer(mode=Timer.PERIODIC, period=${1:500}, callback=${2:tick})' },
  { name: 'machine.reset', kind: 'function', signature: 'machine.reset()', doc: ['Resets the board, like pressing its RESET button.', 'يعيد تشغيل اللوحة كأنك ضغطت زر RESET.'], snippet: 'reset()' },
  { name: 'machine.freq', kind: 'function', signature: 'machine.freq([hz])', doc: ['Returns (or sets) the CPU clock in hertz: 125 MHz on the Pico.', 'يعيد (أو يضبط) تردد المعالج بالهيرتز: 125 MHz في Pico.'], snippet: 'freq()' },
  { name: 'machine.unique_id', kind: 'function', signature: 'machine.unique_id()', doc: ['The board’s unique ID as bytes.', 'المعرّف الفريد للوحة على شكل bytes.'], snippet: 'unique_id()' },
  // ---------------------------------------------------------------------- Pin
  { name: 'Pin.OUT', kind: 'constant', signature: 'Pin.OUT', doc: ['Output mode: the program drives the pin HIGH (3.3 V) or LOW (0 V).', 'وضع الخرج: البرنامج يجعل الطرف HIGH (3.3 V) أو LOW (0 V).'] },
  { name: 'Pin.IN', kind: 'constant', signature: 'Pin.IN', doc: ['Input mode: the program reads the level on the pin.', 'وضع الدخل: البرنامج يقرأ مستوى الطرف.'] },
  { name: 'Pin.PULL_UP', kind: 'constant', signature: 'Pin.PULL_UP', doc: ['Internal pull-up (~50 kΩ to 3.3 V): an open button reads 1, pressed to GND reads 0.', 'مقاومة سحب داخلية للأعلى (~50 kΩ إلى 3.3 V): الزر المفتوح يُقرأ 1 والمضغوط إلى GND يُقرأ 0.'] },
  { name: 'Pin.PULL_DOWN', kind: 'constant', signature: 'Pin.PULL_DOWN', doc: ['Internal pull-down (~50 kΩ to GND): an open button reads 0, pressed to 3.3 V reads 1.', 'مقاومة سحب داخلية للأسفل (~50 kΩ إلى GND): الزر المفتوح يُقرأ 0 والمضغوط إلى 3.3 V يُقرأ 1.'] },
  { name: 'Pin.IRQ_RISING', kind: 'constant', signature: 'Pin.IRQ_RISING', doc: ['Interrupt when the pin goes from 0 to 1.', 'مقاطعة عند انتقال الطرف من 0 إلى 1.'] },
  { name: 'Pin.IRQ_FALLING', kind: 'constant', signature: 'Pin.IRQ_FALLING', doc: ['Interrupt when the pin goes from 1 to 0 (a button to GND being pressed).', 'مقاطعة عند انتقال الطرف من 1 إلى 0 (مثل ضغط زر موصول إلى GND).'] },
  { name: 'Pin.value', kind: 'method', signature: 'pin.value([x])', doc: ['Without an argument reads the pin (0 or 1); `value(1)` / `value(0)` drives an output.', 'دون وسيط تقرأ الطرف (0 أو 1)، و`value(1)` أو `value(0)` تقود الخرج.'], snippet: 'value(${1})' },
  { name: 'Pin.on', kind: 'method', signature: 'pin.on()', doc: ['Sets an output HIGH.', 'يجعل الخرج HIGH.'], snippet: 'on()' },
  { name: 'Pin.off', kind: 'method', signature: 'pin.off()', doc: ['Sets an output LOW.', 'يجعل الخرج LOW.'], snippet: 'off()' },
  { name: 'Pin.toggle', kind: 'method', signature: 'pin.toggle()', doc: ['Inverts an output: HIGH becomes LOW and the other way round.', 'يعكس الخرج: HIGH يصير LOW والعكس.'], snippet: 'toggle()' },
  { name: 'Pin.irq', kind: 'method', signature: 'pin.irq(handler, trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING)', doc: ['Runs `handler(pin)` when the pin changes. Keep the handler short.', 'يشغّل `handler(pin)` عند تغيّر الطرف. اجعل الدالة قصيرة.'], snippet: 'irq(handler=${1:pressed}, trigger=Pin.${2|IRQ_FALLING,IRQ_RISING|})' },
  { name: 'Pin.init', kind: 'method', signature: 'pin.init(mode, pull)', doc: ['Changes the mode or pull of the pin.', 'يغيّر وضع الطرف أو مقاومة السحب.'], snippet: 'init(Pin.${1|OUT,IN|})' },
  // ---------------------------------------------------------------------- PWM
  { name: 'PWM.freq', kind: 'method', signature: 'pwm.freq([hz])', doc: ['PWM frequency in hertz (1 kHz for LEDs, 50 Hz for servos).', 'تردد PWM بالهيرتز (1 kHz للثنائيات الضوئية و50 Hz للسيرفو).'], snippet: 'freq(${1:1000})' },
  { name: 'PWM.duty_u16', kind: 'method', signature: 'pwm.duty_u16([value])', doc: ['Duty cycle from 0 (always off) to 65535 (always on).', 'نسبة التشغيل من 0 (مطفأ دائماً) إلى 65535 (مشغّل دائماً).'], snippet: 'duty_u16(${1:32768})' },
  { name: 'PWM.duty_ns', kind: 'method', signature: 'pwm.duty_ns([ns])', doc: ['High time of each period in nanoseconds (servo: 1 000 000–2 000 000).', 'زمن HIGH في كل دورة بالنانوثانية (السيرفو: من 1000000 إلى 2000000).'], snippet: 'duty_ns(${1:1500000})' },
  { name: 'PWM.deinit', kind: 'method', signature: 'pwm.deinit()', doc: ['Stops the PWM output.', 'يوقف خرج PWM.'], snippet: 'deinit()' },
  // ---------------------------------------------------------------------- ADC
  { name: 'ADC.read_u16', kind: 'method', signature: 'adc.read_u16()', doc: ['Reads the voltage as 0–65535 (0 V … 3.3 V). Volts: `adc.read_u16() * 3.3 / 65535`.', 'يقرأ الجهد كرقم من 0 إلى 65535 (0 V … 3.3 V). بالفولت: `adc.read_u16() * 3.3 / 65535`.'], snippet: 'read_u16()' },
  // ---------------------------------------------------------------------- I2C
  { name: 'I2C.scan', kind: 'method', signature: 'i2c.scan()', doc: ['Lists the addresses of the devices that answer, e.g. `[39]` (0x27) for an I2C LCD.', 'يعيد عناوين الأجهزة التي تستجيب، مثلاً `[39]` (0x27) لشاشة LCD بواجهة I2C.'], snippet: 'scan()' },
  { name: 'I2C.writeto', kind: 'method', signature: 'i2c.writeto(addr, buf)', doc: ['Writes bytes to a device.', 'يكتب بايتات إلى جهاز.'], snippet: 'writeto(${1:0x27}, bytes([${2:0}]))' },
  { name: 'I2C.readfrom', kind: 'method', signature: 'i2c.readfrom(addr, nbytes)', doc: ['Reads bytes from a device.', 'يقرأ بايتات من جهاز.'], snippet: 'readfrom(${1:0x68}, ${2:1})' },
  { name: 'I2C.writeto_mem', kind: 'method', signature: 'i2c.writeto_mem(addr, memaddr, buf)', doc: ['Writes to a register of a device.', 'يكتب في سجل داخل جهاز.'], snippet: 'writeto_mem(${1:0x68}, ${2:0x6B}, bytes([${3:0}]))' },
  { name: 'I2C.readfrom_mem', kind: 'method', signature: 'i2c.readfrom_mem(addr, memaddr, nbytes)', doc: ['Reads registers of a device (e.g. MPU-6050 at 0x68).', 'يقرأ سجلات جهاز (مثل MPU-6050 على العنوان 0x68).'], snippet: 'readfrom_mem(${1:0x68}, ${2:0x3B}, ${3:6})' },
  // ---------------------------------------------------------------------- SPI
  { name: 'SPI.write', kind: 'method', signature: 'spi.write(buf)', doc: ['Sends bytes.', 'يرسل بايتات.'], snippet: 'write(bytes([${1:0}]))' },
  { name: 'SPI.read', kind: 'method', signature: 'spi.read(nbytes, write=0x00)', doc: ['Receives bytes.', 'يستقبل بايتات.'], snippet: 'read(${1:1})' },
  { name: 'SPI.write_readinto', kind: 'method', signature: 'spi.write_readinto(write_buf, read_buf)', doc: ['Sends and receives at the same time.', 'يرسل ويستقبل في الوقت نفسه.'], snippet: 'write_readinto(${1:tx}, ${2:rx})' },
  // --------------------------------------------------------------------- UART
  { name: 'UART.write', kind: 'method', signature: 'uart.write(buf)', doc: ['Sends text or bytes on TX.', 'يرسل نصاً أو بايتات على TX.'], snippet: "write('${1:hello}\\n')" },
  { name: 'UART.read', kind: 'method', signature: 'uart.read([nbytes])', doc: ['Reads the received bytes (None if nothing arrived).', 'يقرأ البايتات المستلمة (None إذا لم يصل شيء).'], snippet: 'read()' },
  { name: 'UART.readline', kind: 'method', signature: 'uart.readline()', doc: ['Reads up to the end of a line.', 'يقرأ حتى نهاية السطر.'], snippet: 'readline()' },
  { name: 'UART.any', kind: 'method', signature: 'uart.any()', doc: ['Number of bytes waiting to be read.', 'عدد البايتات المنتظرة للقراءة.'], snippet: 'any()' },
  // -------------------------------------------------------------------- Timer
  { name: 'Timer.PERIODIC', kind: 'constant', signature: 'Timer.PERIODIC', doc: ['The callback runs again every period.', 'تُستدعى الدالة مجدداً في كل دورة.'] },
  { name: 'Timer.ONE_SHOT', kind: 'constant', signature: 'Timer.ONE_SHOT', doc: ['The callback runs once.', 'تُستدعى الدالة مرة واحدة.'] },
  { name: 'Timer.init', kind: 'method', signature: 'timer.init(*, mode, freq, period, callback)', doc: ['Starts the timer: `period` in milliseconds or `freq` in hertz.', 'يبدأ المؤقت: `period` بالميلي ثانية أو `freq` بالهيرتز.'], snippet: 'init(mode=Timer.PERIODIC, period=${1:500}, callback=${2:tick})' },
  { name: 'Timer.deinit', kind: 'method', signature: 'timer.deinit()', doc: ['Stops the timer.', 'يوقف المؤقت.'], snippet: 'deinit()' },
  // --------------------------------------------------------------------- time
  { name: 'time.sleep', kind: 'function', signature: 'time.sleep(seconds)', doc: ['Waits the given number of seconds (0.5 = half a second).', 'ينتظر عدد الثواني المعطى (0.5 = نصف ثانية).'], snippet: 'sleep(${1:0.5})' },
  { name: 'time.sleep_ms', kind: 'function', signature: 'time.sleep_ms(ms)', doc: ['Waits the given number of milliseconds.', 'ينتظر عدد الميلي ثواني المعطى.'], snippet: 'sleep_ms(${1:100})' },
  { name: 'time.sleep_us', kind: 'function', signature: 'time.sleep_us(us)', doc: ['Waits the given number of microseconds.', 'ينتظر عدد المايكرو ثواني المعطى.'], snippet: 'sleep_us(${1:10})' },
  { name: 'time.ticks_ms', kind: 'function', signature: 'time.ticks_ms()', doc: ['A millisecond counter; compare two readings with `ticks_diff`.', 'عدّاد بالميلي ثانية؛ قارن قراءتين باستخدام `ticks_diff`.'], snippet: 'ticks_ms()' },
  { name: 'time.ticks_us', kind: 'function', signature: 'time.ticks_us()', doc: ['A microsecond counter.', 'عدّاد بالمايكرو ثانية.'], snippet: 'ticks_us()' },
  { name: 'time.ticks_diff', kind: 'function', signature: 'time.ticks_diff(end, start)', doc: ['Time between two tick readings (handles the counter wrapping round).', 'الزمن بين قراءتين للعدّاد (يعالج رجوع العدّاد إلى الصفر).'], snippet: 'ticks_diff(${1:time.ticks_ms()}, ${2:start})' },
  { name: 'time.time', kind: 'function', signature: 'time.time()', doc: ['Seconds since the epoch, as an integer.', 'الثواني منذ بداية الحقبة، كعدد صحيح.'], snippet: 'time()' },
  // ----------------------------------------------------------------- neopixel
  { name: 'neopixel.NeoPixel', kind: 'class', signature: 'NeoPixel(pin, n)', doc: ['A chain of `n` WS2812 LEDs on a pin. Set `np[i] = (r, g, b)` then call `np.write()`.', 'سلسلة من `n` ثنائيات WS2812 على طرف. اضبط `np[i] = (r, g, b)` ثم استدعِ `np.write()`.'], snippet: 'NeoPixel(Pin(${1:16}), ${2:8})' },
  { name: 'NeoPixel.write', kind: 'method', signature: 'np.write()', doc: ['Sends the colours to the LEDs.', 'يرسل الألوان إلى الثنائيات.'], snippet: 'write()' },
  { name: 'NeoPixel.fill', kind: 'method', signature: 'np.fill((r, g, b))', doc: ['Sets every LED to one colour (call `write()` afterwards).', 'يضبط كل الثنائيات على لون واحد (استدعِ `write()` بعدها).'], snippet: 'fill((${1:0}, ${2:0}, ${3:0}))' },
];

const MODULES = new Set(API.filter((e) => e.kind === 'module').map((e) => e.name));
/** Class name -> module that defines it (`Pin` -> `machine`). */
const CLASSES = new Map(API.filter((e) => e.kind === 'class').map((e) => [e.name.split('.')[1], e.name.split('.')[0]]));
const byName = new Map(API.map((e) => [e.name, e]));

/** `led = Pin(...)` / `pwm = machine.PWM(...)` -> variable name to class name. */
function variableClasses(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^\s*(\w+)\s*=\s*(?:\w+\.)?(\w+)\s*\(/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) if (CLASSES.has(m[2])) out.set(m[1], m[2]);
  return out;
}

/** What `obj.` refers to: a module, a class or a variable holding an instance. */
function scopeOf(obj: string, text: string): string | null {
  if (MODULES.has(obj) || CLASSES.has(obj)) return obj;
  return variableClasses(text).get(obj) ?? null;
}

const docOf = (e: PyEntry) => e.doc[getLanguage() === 'ar' ? 1 : 0];

/** A class is documented under its module (`machine.Pin`); find it by its short name too. */
const entryFor = (name: string) => byName.get(name) ?? (CLASSES.has(name) ? byName.get(`${CLASSES.get(name)}.${name}`) : undefined);

export function registerPythonLanguage(monaco: typeof Monaco) {
  const K = monaco.languages.CompletionItemKind;
  const KIND = { module: K.Module, class: K.Class, function: K.Function, method: K.Method, constant: K.Constant };
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const R = monaco.languages.CompletionItemInsertTextRule;
      const item = (e: PyEntry, label: string) => ({
        label,
        kind: KIND[e.kind],
        detail: e.signature,
        documentation: { value: docOf(e) },
        insertText: e.snippet ?? label,
        insertTextRules: R.InsertAsSnippet,
        range,
      });
      const dotted = /(\w+)\.\w*$/.exec(line);
      if (dotted) {
        const scope = scopeOf(dotted[1], model.getValue());
        if (!scope) return { suggestions: [] };
        const prefix = `${scope}.`;
        // On a class name offer its constants; on an instance its methods; on a module everything.
        const fits = (e: PyEntry) => MODULES.has(scope) || (scope === dotted[1] ? e.kind === 'constant' : e.kind === 'method');
        return { suggestions: API.filter((e) => e.name.startsWith(prefix) && fits(e)).map((e) => item(e, e.name.slice(prefix.length))) };
      }
      // Top level: modules, the classes (as imported with "from machine import Pin") and import lines.
      const suggestions = [
        ...API.filter((e) => e.kind === 'module').map((e) => item(e, e.name)),
        ...API.filter((e) => e.kind === 'class').map((e) => item(e, e.name.split('.')[1])),
        ...[
          'from machine import Pin',
          'from machine import Pin, PWM',
          'from machine import Pin, ADC',
          'from machine import Pin, I2C',
          'import time',
        ].map((text) => ({ label: text, kind: K.Snippet, insertText: text, range })),
      ];
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const obj = /(\w+)\.$/.exec(before);
      let entry: PyEntry | undefined;
      if (obj) {
        const scope = scopeOf(obj[1], model.getValue());
        entry = scope ? entryFor(`${scope}.${word.word}`) : undefined;
      } else entry = entryFor(word.word);
      if (!entry) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: '```python\n' + entry.signature + '\n```' }, { value: docOf(entry) }],
      };
    },
  });
}

/** The documented API (for tests). */
export const PYTHON_API: readonly PyEntry[] = API;
