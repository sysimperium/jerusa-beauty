import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_ORIGEM = os.path.join(BASE_DIR, 'logomarca.png')
IMG_DIR = os.path.join(BASE_DIR, 'public', 'img')

os.makedirs(IMG_DIR, exist_ok=True)

print(f"Lendo logo de: {LOGO_ORIGEM}")
img = Image.open(LOGO_ORIGEM).convert("RGBA")

# 1. Logo principal (512x512)
logo_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
logo_512.save(os.path.join(IMG_DIR, 'logo.png'), 'PNG', optimize=True)
logo_512.save(os.path.join(IMG_DIR, 'logo-retrato.png'), 'PNG', optimize=True)
logo_512.save(os.path.join(IMG_DIR, 'icon-512.png'), 'PNG', optimize=True)

# 2. Preview WhatsApp / OpenGraph (1200x630 com margem)
canvas_preview = Image.new("RGBA", (1200, 630), (255, 255, 255, 255))
logo_preview_fit = img.resize((500, 500), Image.Resampling.LANCZOS)
offset_x = (1200 - 500) // 2
offset_y = (630 - 500) // 2
canvas_preview.paste(logo_preview_fit, (offset_x, offset_y), logo_preview_fit)
canvas_preview.convert("RGB").save(os.path.join(IMG_DIR, 'logo-preview.png'), 'PNG', optimize=True)

# 3. Icon 192x192 (PWA Android)
img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(IMG_DIR, 'icon-192.png'), 'PNG', optimize=True)

# 4. Apple Touch Icon 180x180 (iOS)
img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(IMG_DIR, 'apple-touch-icon.png'), 'PNG', optimize=True)

# 5. Favicon 64x64
img.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(IMG_DIR, 'favicon.png'), 'PNG', optimize=True)

print("Todos os assets visuais foram gerados com sucesso!")
