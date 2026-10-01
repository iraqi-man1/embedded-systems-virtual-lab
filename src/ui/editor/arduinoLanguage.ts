/** Arduino API completions, snippets and hover documentation for Monaco. */
import type * as Monaco from 'monaco-editor';

interface ApiEntry {
  name: string;
  signature: string;
  doc: string;
  snippet?: string;
  kind?: 'function' | 'constant' | 'class';
}

const API: ApiEntry[] = [
  { name: 'pinMode', signature: 'void pinMode(uint8_t pin, uint8_t mode)', doc: 'Configures a pin as INPUT, OUTPUT or INPUT_PULLUP.', snippet: 'pinMode(${1:pin}, ${2|OUTPUT,INPUT,INPUT_PULLUP|});' },
  { name: 'digitalWrite', signature: 'void digitalWrite(uint8_t pin, uint8_t value)', doc: 'Drives an OUTPUT pin HIGH (Vcc) or LOW (0 V). On an INPUT pin, HIGH enables the internal pull-up.', snippet: 'digitalWrite(${1:pin}, ${2|HIGH,LOW|});' },
  { name: 'digitalRead', signature: 'int digitalRead(uint8_t pin)', doc: 'Reads the logic level of a pin: HIGH or LOW. Floating inputs read unpredictable values.', snippet: 'digitalRead(${1:pin})' },
  { name: 'analogRead', signature: 'int analogRead(uint8_t pin)', doc: 'Reads the 10-bit ADC (0..1023) on an analog pin. 0 = 0 V, 1023 = AREF (5 V by default).', snippet: 'analogRead(${1:A0})' },
  { name: 'analogWrite', signature: 'void analogWrite(uint8_t pin, int value)', doc: 'Outputs PWM with duty value/255 on a PWM pin (Uno: 3, 5, 6, 9, 10, 11). ~490 Hz (980 Hz on 5 and 6).', snippet: 'analogWrite(${1:9}, ${2:128});' },
  { name: 'analogReference', signature: 'void analogReference(uint8_t mode)', doc: 'Selects the ADC reference: DEFAULT, INTERNAL or EXTERNAL.', snippet: 'analogReference(${1|DEFAULT,INTERNAL,EXTERNAL|});' },
  { name: 'delay', signature: 'void delay(unsigned long ms)', doc: 'Pauses the program for the given number of milliseconds.', snippet: 'delay(${1:1000});' },
  { name: 'delayMicroseconds', signature: 'void delayMicroseconds(unsigned int us)', doc: 'Pauses for the given number of microseconds.', snippet: 'delayMicroseconds(${1:10});' },
  { name: 'millis', signature: 'unsigned long millis()', doc: 'Milliseconds since the program started (overflows after ~50 days).', snippet: 'millis()' },
  { name: 'micros', signature: 'unsigned long micros()', doc: 'Microseconds since the program started (4 µs resolution at 16 MHz).', snippet: 'micros()' },
  { name: 'tone', signature: 'void tone(uint8_t pin, unsigned int frequency, unsigned long duration = 0)', doc: 'Generates a 50% duty square wave of the given frequency on a pin.', snippet: 'tone(${1:pin}, ${2:440});' },
  { name: 'noTone', signature: 'void noTone(uint8_t pin)', doc: 'Stops a tone started with tone().', snippet: 'noTone(${1:pin});' },
  { name: 'pulseIn', signature: 'unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout = 1000000)', doc: 'Measures the length of a HIGH or LOW pulse in microseconds (e.g. HC-SR04 echo).', snippet: 'pulseIn(${1:pin}, ${2|HIGH,LOW|})' },
  { name: 'shiftOut', signature: 'void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder, uint8_t val)', doc: 'Bit-bangs a byte out on dataPin, toggling clockPin for each bit (e.g. 74HC595).', snippet: 'shiftOut(${1:dataPin}, ${2:clockPin}, ${3|MSBFIRST,LSBFIRST|}, ${4:value});' },
  { name: 'shiftIn', signature: 'uint8_t shiftIn(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder)', doc: 'Bit-bangs a byte in.', snippet: 'shiftIn(${1:dataPin}, ${2:clockPin}, ${3|MSBFIRST,LSBFIRST|})' },
  { name: 'attachInterrupt', signature: 'void attachInterrupt(uint8_t interrupt, void (*isr)(), int mode)', doc: 'Runs isr on a pin change. Use digitalPinToInterrupt(pin); Uno supports pins 2 and 3.', snippet: 'attachInterrupt(digitalPinToInterrupt(${1:2}), ${2:isr}, ${3|CHANGE,RISING,FALLING,LOW|});' },
  { name: 'detachInterrupt', signature: 'void detachInterrupt(uint8_t interrupt)', doc: 'Disables an external interrupt.', snippet: 'detachInterrupt(digitalPinToInterrupt(${1:2}));' },
  { name: 'map', signature: 'long map(long x, long inMin, long inMax, long outMin, long outMax)', doc: 'Re-maps a number from one range to another (integer math).', snippet: 'map(${1:value}, ${2:0}, ${3:1023}, ${4:0}, ${5:255})' },
  { name: 'constrain', signature: 'constrain(x, a, b)', doc: 'Limits x to the range [a, b].', snippet: 'constrain(${1:x}, ${2:0}, ${3:255})' },
  { name: 'random', signature: 'long random(long min, long max)', doc: 'Pseudo-random number in [min, max).', snippet: 'random(${1:0}, ${2:100})' },
  { name: 'randomSeed', signature: 'void randomSeed(unsigned long seed)', doc: 'Initialises the pseudo-random generator.', snippet: 'randomSeed(${1:analogRead(A5)});' },
  { name: 'Serial.begin', signature: 'void Serial.begin(unsigned long baud)', doc: 'Opens the hardware serial port (pins 0/1, also the Serial Monitor).', snippet: 'Serial.begin(${1|9600,115200|});' },
  { name: 'Serial.print', signature: 'size_t Serial.print(value)', doc: 'Prints text or a number without a newline.', snippet: 'Serial.print(${1:value});' },
  { name: 'Serial.println', signature: 'size_t Serial.println(value)', doc: 'Prints text or a number followed by CR LF. Use "name:value" pairs for the Serial Plotter.', snippet: 'Serial.println(${1:value});' },
  { name: 'Serial.available', signature: 'int Serial.available()', doc: 'Number of bytes waiting in the receive buffer.', snippet: 'Serial.available()' },
  { name: 'Serial.read', signature: 'int Serial.read()', doc: 'Reads one received byte (-1 if none).', snippet: 'Serial.read()' },
  { name: 'Serial.write', signature: 'size_t Serial.write(uint8_t b)', doc: 'Sends a raw byte.', snippet: 'Serial.write(${1:byte});' },
  { name: 'Serial.parseInt', signature: 'long Serial.parseInt()', doc: 'Reads digits from the serial buffer and returns the number.', snippet: 'Serial.parseInt()' },
  { name: 'Serial.readStringUntil', signature: "String Serial.readStringUntil(char terminator)", doc: 'Reads characters until the terminator.', snippet: "Serial.readStringUntil('${1:\\n}')" },
  { name: 'Wire.begin', signature: 'void Wire.begin()', doc: 'Joins the I2C bus as controller (Uno: SDA=A4, SCL=A5).', snippet: 'Wire.begin();' },
  { name: 'Wire.beginTransmission', signature: 'void Wire.beginTransmission(uint8_t address)', doc: 'Starts an I2C write to a 7-bit address.', snippet: 'Wire.beginTransmission(${1:0x27});' },
  { name: 'Wire.endTransmission', signature: 'uint8_t Wire.endTransmission()', doc: 'Sends the queued bytes; returns 0 on success (ACK).', snippet: 'Wire.endTransmission()' },
  { name: 'Wire.requestFrom', signature: 'uint8_t Wire.requestFrom(uint8_t address, uint8_t count)', doc: 'Reads bytes from an I2C target.', snippet: 'Wire.requestFrom(${1:0x68}, ${2:1});' },
  { name: 'SPI.begin', signature: 'void SPI.begin()', doc: 'Initialises the SPI controller (Uno: MOSI=11, MISO=12, SCK=13).', snippet: 'SPI.begin();' },
  { name: 'SPI.transfer', signature: 'uint8_t SPI.transfer(uint8_t data)', doc: 'Exchanges one byte over SPI.', snippet: 'SPI.transfer(${1:data})' },
];

const CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'MSBFIRST', 'LSBFIRST', 'CHANGE', 'RISING', 'FALLING', 'DEFAULT', 'INTERNAL', 'EXTERNAL', 'PI', 'HALF_PI', 'TWO_PI', 'DEG_TO_RAD', 'RAD_TO_DEG'];
const TYPES = ['byte', 'word', 'boolean', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'size_t'];

export function registerArduinoLanguage(monaco: typeof Monaco) {
  monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const objMatch = /(\w+)\.\w*$/.exec(line);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const K = monaco.languages.CompletionItemKind;
      const R = monaco.languages.CompletionItemInsertTextRule;
      if (objMatch) {
        const prefix = `${objMatch[1]}.`;
        return {
          suggestions: API.filter((a) => a.name.startsWith(prefix)).map((a) => ({
            label: a.name.slice(prefix.length),
            kind: K.Method,
            detail: a.signature,
            documentation: a.doc,
            insertText: (a.snippet ?? a.name).slice(prefix.length),
            insertTextRules: R.InsertAsSnippet,
            range,
          })),
        };
      }
      const suggestions: Monaco.languages.CompletionItem[] = [
        ...API.filter((a) => !a.name.includes('.')).map((a) => ({
          label: a.name,
          kind: K.Function,
          detail: a.signature,
          documentation: a.doc,
          insertText: a.snippet ?? a.name,
          insertTextRules: R.InsertAsSnippet,
          range,
        })),
        ...['Serial', 'Wire', 'SPI'].map((o) => ({ label: o, kind: K.Module, insertText: o, range })),
        ...CONSTANTS.map((c) => ({ label: c, kind: K.Constant, insertText: c, range })),
        ...TYPES.map((t) => ({ label: t, kind: K.TypeParameter, insertText: t, range })),
        {
          label: 'setup/loop',
          kind: K.Snippet,
          documentation: 'Arduino sketch skeleton',
          insertText: 'void setup() {\n\t${1}\n}\n\nvoid loop() {\n\t${2}\n}\n',
          insertTextRules: R.InsertAsSnippet,
          range,
        },
        {
          label: 'millis-timer',
          kind: K.Snippet,
          documentation: 'Non-blocking timer using millis()',
          insertText: 'static unsigned long last = 0;\nif (millis() - last >= ${1:1000}) {\n\tlast = millis();\n\t${2}\n}',
          insertTextRules: R.InsertAsSnippet,
          range,
        },
      ];
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider('cpp', {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const before = line.slice(0, word.startColumn - 1);
      const obj = /(\w+)\.$/.exec(before);
      const name = obj ? `${obj[1]}.${word.word}` : word.word;
      const entry = API.find((a) => a.name === name);
      if (!entry) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: '```cpp\n' + entry.signature + '\n```' }, { value: entry.doc }],
      };
    },
  });
}
