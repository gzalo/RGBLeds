from PIL import Image
import random

# Image dimensions
WIDTH = 4   # 4 LED strips
HEIGHT = 60 # 60 frames

# Christmas colors (RGB)
COLORS = [
    (255, 255, 255),  # White
    (0, 0, 0),        # Black
    (255, 0, 0),      # Red
    (0, 255, 0),      # Green
]

# Create image
img = Image.new('RGB', (WIDTH, HEIGHT))

# Fill each pixel with random christmas colors
for y in range(HEIGHT):
    for x in range(WIDTH):
        color = random.choice(COLORS)
        img.putpixel((x, y), color)

# Save the image
img.save('christmas_fast.png')