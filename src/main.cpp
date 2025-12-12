#include <avr/io.h>
#include <util/delay.h>
#include <avr/interrupt.h>
#include <string.h>

// Init I/O pins
void boardInit(){
	DDRB = 0b00000001;
	DDRD = 0b11111100;
	DDRC = 0b00111111;	

    PORTB |= 1;
    _delay_ms(500);
    PORTB &= ~1;
    _delay_ms(500);
    PORTB |= 1;
    _delay_ms(500);
    PORTB &= ~1;
}

#define STRIP0 4
#define STRIP1 8
#define STRIP2 16
#define STRIP3 32
#define STRIP4 64
#define STRIP5 128

#define STRIP6 1
#define STRIP7 2
#define STRIP8 4
#define STRIP9 8
#define STRIP10 16
#define STRIP11 32

volatile uint8_t pwm[12], pwmAcc = 0;

// Pattern storage in RAM
// Each frame is 12 bytes (4 RGB strips), max ~60 frames in 720 bytes
#define MAX_FRAMES 60
#define FRAME_SIZE 12
uint8_t patternBuffer[MAX_FRAMES * FRAME_SIZE];
volatile uint8_t patternLength = 0;  // Number of frames stored
volatile uint8_t currentFrame = 0;   // Current playback frame
volatile uint8_t playbackSpeed = 5;  // Speed 1-10 (higher = faster)
volatile uint8_t playbackEnabled = 0; // Whether pattern playback is active
volatile uint16_t tickCounter = 0;   // Counter for timing
volatile uint16_t interpProgress = 0; // 0-255 interpolation progress (uint16_t to detect overflow)

// Control loop
ISR (TIMER0_OVF_vect){
	if(pwm[0] > pwmAcc) PORTD |= STRIP0; else	PORTD &= ~STRIP0;
	if(pwm[1] > pwmAcc) PORTD |= STRIP1; else	PORTD &= ~STRIP1;
	if(pwm[2] > pwmAcc) PORTD |= STRIP2; else	PORTD &= ~STRIP2;
	if(pwm[3] > pwmAcc) PORTD |= STRIP3; else	PORTD &= ~STRIP3;
	if(pwm[4] > pwmAcc) PORTD |= STRIP4; else	PORTD &= ~STRIP4;
	if(pwm[5] > pwmAcc) PORTD |= STRIP5; else	PORTD &= ~STRIP5;
	
	if(pwm[6] > pwmAcc) PORTC |= STRIP6; else	PORTC &= ~STRIP6;
	if(pwm[7] > pwmAcc) PORTC |= STRIP7; else	PORTC &= ~STRIP7;
	if(pwm[8] > pwmAcc) PORTC |= STRIP8; else	PORTC &= ~STRIP8;
	if(pwm[9] > pwmAcc) PORTC |= STRIP9; else	PORTC &= ~STRIP9;
	if(pwm[10] > pwmAcc) PORTC |= STRIP10; else	PORTC &= ~STRIP10;
	if(pwm[11] > pwmAcc) PORTC |= STRIP11; else	PORTC &= ~STRIP11;

	pwmAcc++;
	TCNT0+=0xFF-24;
}

// Init timer and interrupts
void systickInit(){
	TCCR0 = 0b00000010;	//CLK/8

	TIMSK |= (1 << TOIE0);	
	sei();
}

#define BAUD 115200
#define BAUDRATE ((F_CPU+BAUD*8UL)/(BAUD*16UL)-1UL)

void uartInit(){
	UBRRH = (uint8_t)(BAUDRATE>>8);
	UBRRL = (uint8_t)(BAUDRATE);

	UCSRB = (1<<RXEN)|(1<<TXEN);
	UCSRC = (1<<URSEL)|(3<<UCSZ0);	
}

uint8_t uartGetchar(){
	while(!(UCSRA & (1<<RXC)));
	return UDR;
}

uint8_t uartAvailable(){
	return (UCSRA & (1<<RXC)) != 0;
}

// Interpolate between two frames and load into PWM values
// progress: 0-255, where 0 = frame1, 255 = almost frame2
void loadInterpolatedFrame(uint8_t frame1, uint8_t frame2, uint8_t progress){
	uint8_t i;
	uint8_t *ptr1 = &patternBuffer[frame1 * FRAME_SIZE];
	uint8_t *ptr2 = &patternBuffer[frame2 * FRAME_SIZE];
	int16_t val1, val2, diff;
	
	cli(); // Disable interrupts for atomic PWM update
	for(i = 0; i < 12; i++){
		val1 = ptr1[i];
		val2 = ptr2[i];
		// Linear interpolation: val1 + (val2 - val1) * progress / 256
		// Using int16_t to avoid overflow in multiplication
		diff = val2 - val1;
		pwm[i] = (uint8_t)(val1 + ((diff * (int16_t)progress) >> 8));
	}
	sei(); // Re-enable interrupts
}

// Load a frame directly (no interpolation)
void loadFrame(uint8_t frameIndex){
	loadInterpolatedFrame(frameIndex, frameIndex, 0);
}

// Commands:
// 0xFF + 12 bytes: Set static color (stops playback)
// 0xFE + 1 byte (count) + count*12 bytes: Upload pattern and start playback
// 0xFD + 1 byte: Set speed (1-10)
// 0xFC: Start playback
// 0xFB: Stop playback

int main(){
	uint8_t cmd, frameCount;
	uint16_t i, speedTicks;
	
	boardInit();
	uartInit();
	systickInit();
	
	while(1){
		// Pattern playback logic with interpolation
		if(playbackEnabled && patternLength > 0){
			// Speed: 1 = slowest, 10 = fastest
			// Lower speedTicks = faster updates for smooth interpolation
			speedTicks = (11 - playbackSpeed) * 20;
			
			tickCounter++;
			if(tickCounter >= speedTicks){
				tickCounter = 0;
				
				// Increment interpolation progress
				// Step size affects smoothness vs speed
				interpProgress += 8;
				
				// Check if we've completed transition (progress >= 256)
				if(interpProgress >= 256){
					interpProgress = 0;
					
					// Advance to next frame (wrap around)
					currentFrame++;
					if(currentFrame >= patternLength){
						currentFrame = 0;
					}
				}
				
				// Calculate next frame index for interpolation
				uint8_t nextFrame = currentFrame + 1;
				if(nextFrame >= patternLength) nextFrame = 0;
				
				// Load interpolated values between current and next frame
				loadInterpolatedFrame(currentFrame, nextFrame, (uint8_t)interpProgress);
			}
		}
		
		// Check for incoming commands
		if(uartAvailable()){
			cmd = uartGetchar();
			
			if(cmd == 0xFF){
				// Static color command: stop playback, set colors directly
				playbackEnabled = 0;
				for(i = 0; i < 12; i++){
					pwm[i] = uartGetchar();
				}
			}
			else if(cmd == 0xFE){
				// Upload pattern command
				frameCount = uartGetchar();
				if(frameCount > MAX_FRAMES) frameCount = MAX_FRAMES;
				
				// Stop playback during upload to prevent reading partial data
				playbackEnabled = 0;
				for(i = 0; i < frameCount * FRAME_SIZE; i++){
					patternBuffer[i] = uartGetchar();
				}
				patternLength = frameCount; // Set length after buffer is filled
				PORTB ^= 1;
				
				// Start playback
				currentFrame = 0;
				tickCounter = 0;
				interpProgress = 0;
				playbackEnabled = 1;
				loadFrame(0);
			}
			else if(cmd == 0xFD){
				// Set speed command
				playbackSpeed = uartGetchar();
				if(playbackSpeed < 1) playbackSpeed = 1;
				if(playbackSpeed > 10) playbackSpeed = 10;
			}
			else if(cmd == 0xFC){
				// Start playback
				if(patternLength > 0){
					currentFrame = 0;
					tickCounter = 0;
					interpProgress = 0;
					playbackEnabled = 1;
					loadFrame(0);
				}
			}
			else if(cmd == 0xFB){
				// Stop playback
				playbackEnabled = 0;
			}
		}
	}
	
	return 0;
}
