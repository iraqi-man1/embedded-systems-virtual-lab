// 74HC595 via hardware SPI: MOSI=11 -> SER, SCK=13 -> SRCLK, latch on pin 10.
#include <SPI.h>
void setup() {
  pinMode(10, OUTPUT);
  SPI.begin();
  digitalWrite(10, LOW);
  SPI.transfer(0b11000011);
  digitalWrite(10, HIGH);
}
void loop() {}
