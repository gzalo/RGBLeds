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

uint8_t getchar(){
	while(!(UCSRA & (1<<RXC)));
	return UDR;
}

int main(){
	uint8_t i;
	
	boardInit();
	uartInit();
	systickInit();
	
	while(1){
		PORTB ^= 1; 
		while(getchar()!=0xFF);
		
		for(i=0;i<12;i++)
			pwm[i] = getchar();
		
	}
}
