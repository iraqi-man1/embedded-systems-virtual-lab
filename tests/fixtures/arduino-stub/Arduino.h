// Just enough of the Arduino API to check snippets compile (tests/snippets.test.ts).
#pragma once
#include <stdint.h>
#include <string.h>
typedef uint8_t byte;
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define FALLING 2
#define RISING 3
#define CHANGE 1
#define A0 14
#define constrain(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
unsigned long millis();
void delay(unsigned long ms);
void pinMode(uint8_t pin, uint8_t mode);
int digitalRead(uint8_t pin);
void digitalWrite(uint8_t pin, uint8_t value);
int analogRead(uint8_t pin);
void analogWrite(uint8_t pin, int value);
long map(long x, long inMin, long inMax, long outMin, long outMax);
int digitalPinToInterrupt(uint8_t pin);
void attachInterrupt(int interrupt, void (*isr)(), int mode);
class String {
 public:
  String(const char *s = "");
  void trim();
  bool operator==(const char *s) const;
};
class HardwareSerial {
 public:
  void begin(unsigned long baud);
  int available();
  String readStringUntil(char end);
  void println(const char *s);
  void println(int v);
};
extern HardwareSerial Serial;
