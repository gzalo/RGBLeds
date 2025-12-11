#define F_CPU 7372800 

#include <avr/io.h>
#include <util/delay.h>
#include <avr/interrupt.h>
#include <string.h>

// Init I/O pins
void boardInit(){
	DDRB = 0b00000001;
	DDRD = 0b11111100;
	DDRC = 0b00111111;	
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

volatile uint8_t pwm[12], pwmAcc;

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

// Interpolation variables
#define INTERP_STEPS 16  // Number of interpolation steps between frames
volatile uint8_t interpStep = 0;  // Current interpolation step (0 to INTERP_STEPS-1)

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

// Linear interpolation between two values
// Returns a + (b - a) * step / INTERP_STEPS
uint8_t lerp(uint8_t a, uint8_t b, uint8_t step){
	int16_t diff = (int16_t)b - (int16_t)a;
	int16_t result = (int16_t)a + ((diff * step) / INTERP_STEPS);
	return (uint8_t)result;
}

// Interpolate between two frames and load into PWM values
void loadInterpolatedFrame(uint8_t frameIndex, uint8_t nextFrameIndex, uint8_t step){
	uint8_t i;
	uint8_t *framePtr = &patternBuffer[frameIndex * FRAME_SIZE];
	uint8_t *nextFramePtr = &patternBuffer[nextFrameIndex * FRAME_SIZE];
	for(i = 0; i < 12; i++){
		pwm[i] = lerp(framePtr[i], nextFramePtr[i], step);
	}
}

// Load a frame from pattern buffer into PWM values (no interpolation)
void loadFrame(uint8_t frameIndex){
	uint8_t i;
	uint8_t *framePtr = &patternBuffer[frameIndex * FRAME_SIZE];
	for(i = 0; i < 12; i++){
		pwm[i] = framePtr[i];
	}
}

// Commands:
// 0xFF + 12 bytes: Set static color (stops playback)
// 0xFE + 1 byte (count) + count*12 bytes: Upload pattern and start playback
// 0xFD + 1 byte: Set speed (1-10)
// 0xFC: Start playback
// 0xFB: Stop playback

int main(){
	uint8_t i, cmd, frameCount, nextFrame;
	uint16_t speedTicks;
	
	boardInit();
	uartInit();
	systickInit();
	
	while(1){
		// Pattern playback logic with interpolation
		if(playbackEnabled && patternLength > 0){
			// Speed: 1 = slowest, 10 = fastest
			// speedTicks determines how many loop iterations per interpolation step
			speedTicks = (11 - playbackSpeed) * 60;
			
			tickCounter++;
			if(tickCounter >= speedTicks){
				tickCounter = 0;
				
				// Calculate next frame index (wrap around)
				nextFrame = currentFrame + 1;
				if(nextFrame >= patternLength){
					nextFrame = 0;
				}
				
				// Load interpolated values
				loadInterpolatedFrame(currentFrame, nextFrame, interpStep);
				
				// Advance interpolation step
				interpStep++;
				if(interpStep >= INTERP_STEPS){
					interpStep = 0;
					currentFrame = nextFrame;
				}
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
				
				patternLength = frameCount;
				for(i = 0; i < frameCount * FRAME_SIZE; i++){
					patternBuffer[i] = uartGetchar();
				}
				
				// Start playback
				currentFrame = 0;
				interpStep = 0;
				tickCounter = 0;
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
					interpStep = 0;
					tickCounter = 0;
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
