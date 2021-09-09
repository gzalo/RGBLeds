all:
	avr-gcc -Wall -Os -mmcu=atmega8 -c rgbleds.c -o rgbleds.o
	avr-gcc -Wall -Os -mmcu=atmega8 -o rgbleds.elf rgbleds.o
	
	del rgbleds.hex
	avr-objcopy -j .text -j .data -O ihex rgbleds.elf rgbleds.hex
