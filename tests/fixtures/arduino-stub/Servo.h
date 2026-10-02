#pragma once
class Servo {
 public:
  void attach(int pin);
  void write(int angle);
};
