// lib_deps: arduino-irremote/IRremote
// Prints the NEC command of every frame received on pin 2.
#include <IRremote.hpp>
void setup() {
  Serial.begin(115200);
  IrReceiver.begin(2, DISABLE_LED_FEEDBACK);
  Serial.println("ready");
}
void loop() {
  if (IrReceiver.decode()) {
    if (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT) Serial.println("repeat");
    else { Serial.print("cmd="); Serial.println(IrReceiver.decodedIRData.command, HEX); }
    IrReceiver.resume();
  }
}
