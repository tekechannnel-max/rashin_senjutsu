from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "roblox_character_assets"
SOURCE_FRONT = ROOT / "占い素材" / "立ち絵カワウソなし.png"
SOURCE_TURNAROUND = ROOT / "占い素材" / "三面図.jpg"

CANVAS = (585, 559)


TORSO = {
    "up": (231, 8, 128, 64),
    "right": (165, 74, 64, 128),
    "front": (231, 74, 128, 128),
    "left": (361, 74, 64, 128),
    "back": (426, 74, 128, 128),
    "down": (231, 204, 128, 64),
}

RIGHT_LIMB = {
    "up": (217, 290, 64, 64),
    "left": (19, 356, 64, 128),
    "back": (85, 356, 64, 128),
    "right": (151, 356, 64, 128),
    "front": (217, 356, 64, 128),
    "down": (217, 488, 64, 64),
}

LEFT_LIMB = {
    "up": (307, 290, 64, 64),
    "front": (307, 356, 64, 128),
    "left": (373, 356, 64, 128),
    "back": (439, 356, 64, 128),
    "right": (505, 356, 64, 128),
    "down": (307, 488, 64, 64),
}


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def rect_mask(size: tuple[int, int], radius: int = 0) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    if radius:
        draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    else:
        draw.rectangle((0, 0, size[0] - 1, size[1] - 1), fill=255)
    return mask


def paste_region(canvas: Image.Image, region: tuple[int, int, int, int], patch: Image.Image) -> None:
    x, y, w, h = region
    canvas.alpha_composite(patch.crop((0, 0, w, h)), (x, y))


def base_patch(w: int, h: int, color: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", (w, h), color)


def add_fabric_noise(patch: Image.Image, seed: int, opacity: int = 12) -> Image.Image:
    rng = random.Random(seed)
    noise = Image.new("RGBA", patch.size, (0, 0, 0, 0))
    px = noise.load()
    for y in range(patch.size[1]):
        for x in range(patch.size[0]):
            value = rng.randint(-opacity, opacity)
            if value >= 0:
                px[x, y] = (255, 255, 255, value)
            else:
                px[x, y] = (90, 140, 170, -value)
    return Image.alpha_composite(patch, noise.filter(ImageFilter.GaussianBlur(0.35)))


def hydrangea_pattern(size: tuple[int, int], seed: int, dense: bool = True) -> Image.Image:
    rng = random.Random(seed)
    w, h = size
    patch = add_fabric_noise(base_patch(w, h, (232, 247, 253, 235)), seed + 50, 9)
    draw = ImageDraw.Draw(patch, "RGBA")
    count = max(8, (w * h) // (720 if dense else 1350))
    palette = [
        (125, 191, 229, 82),
        (154, 215, 237, 75),
        (185, 205, 246, 62),
        (117, 171, 218, 70),
        (225, 243, 252, 95),
    ]
    for _ in range(count):
        cx = rng.randint(-8, w + 8)
        cy = rng.randint(-8, h + 8)
        radius = rng.randint(4, 10)
        fill = rng.choice(palette)
        for angle in (0, 90, 180, 270):
            dx = math.cos(math.radians(angle)) * radius * 0.65
            dy = math.sin(math.radians(angle)) * radius * 0.65
            draw.ellipse(
                (cx + dx - radius, cy + dy - radius, cx + dx + radius, cy + dy + radius),
                fill=fill,
                outline=(104, 165, 205, 38),
            )
        draw.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=(245, 252, 255, 150))
    return patch


def draw_snowflake(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> None:
    for i in range(6):
        a = math.radians(i * 60)
        x2 = cx + math.cos(a) * radius
        y2 = cy + math.sin(a) * radius
        draw.line((cx, cy, x2, y2), fill=color, width=1)
        for delta in (-0.65, 0.65):
            bx = cx + math.cos(a) * radius * 0.62
            by = cy + math.sin(a) * radius * 0.62
            ba = a + delta
            draw.line(
                (bx, by, bx + math.cos(ba) * radius * 0.24, by + math.sin(ba) * radius * 0.24),
                fill=color,
                width=1,
            )


def add_snow_motifs(patch: Image.Image, seed: int, count: int) -> Image.Image:
    rng = random.Random(seed)
    draw = ImageDraw.Draw(patch, "RGBA")
    w, h = patch.size
    for _ in range(count):
        cx = rng.randint(8, max(9, w - 8))
        cy = rng.randint(8, max(9, h - 8))
        radius = rng.randint(9, 22)
        color = (150, 203, 221, rng.randint(32, 68))
        draw_snowflake(draw, cx, cy, radius, color)
        if radius > 13:
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=color, width=1)
    return patch


def kimono_white(size: tuple[int, int], seed: int) -> Image.Image:
    patch = add_fabric_noise(base_patch(size[0], size[1], (246, 252, 255, 244)), seed, 8)
    return add_snow_motifs(patch, seed + 2, max(2, (size[0] * size[1]) // 3300))


def obi_patch(size: tuple[int, int], vertical: bool = False) -> Image.Image:
    patch = base_patch(size[0], size[1], (30, 28, 26, 246))
    patch = add_fabric_noise(patch, 880 + size[0] + size[1], 10)
    draw = ImageDraw.Draw(patch, "RGBA")
    if vertical:
        step = 20
        for y in range(-20, size[1], step):
            draw.line((2, y, size[0] - 4, y + 18), fill=(158, 126, 77, 70), width=1)
            draw.line((size[0] - 4, y, 2, y + 18), fill=(158, 126, 77, 48), width=1)
    else:
        for x in range(-16, size[0], 22):
            draw.line((x, 2, x + 18, size[1] - 3), fill=(158, 126, 77, 62), width=1)
            draw.line((x + 18, 2, x, size[1] - 3), fill=(158, 126, 77, 42), width=1)
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=(82, 66, 45, 150))
    return patch


def draw_diagonal_panel(patch: Image.Image, seed: int, side: str = "left") -> None:
    w, h = patch.size
    panel = hydrangea_pattern((w, h), seed, dense=True)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    if side == "left":
        draw.polygon([(0, 0), (42, 0), (w, h), (0, h)], fill=185)
    else:
        draw.polygon([(w - 44, 0), (w, 0), (w, h), (0, h)], fill=185)
    patch.alpha_composite(Image.composite(panel, Image.new("RGBA", (w, h), (0, 0, 0, 0)), mask))


def draw_front_kimono(patch: Image.Image) -> Image.Image:
    draw = ImageDraw.Draw(patch, "RGBA")
    draw_diagonal_panel(patch, 110, "left")
    w, h = patch.size
    draw.line((10, 0, w - 18, h - 22), fill=(142, 198, 218, 115), width=2)
    draw.line((w - 26, 0, 16, h - 8), fill=(184, 216, 228, 95), width=2)
    draw.polygon([(74, 0), (90, 0), (73, 34), (56, 62), (44, 92), (30, 126), (16, 126)], fill=(229, 243, 250, 190))
    draw.line((74, 0, 52, 58, 18, 126), fill=(122, 178, 202, 82), width=2)
    draw.rectangle((0, 86, w, 111), fill=(0, 0, 0, 0))
    patch.alpha_composite(obi_patch((w, 24)), (0, 86))
    patch.alpha_composite(obi_patch((22, 42), vertical=True), (45, 86))
    patch.alpha_composite(obi_patch((18, 68), vertical=True), (62, 86))
    draw.rectangle((0, 0, w - 1, h - 1), outline=(159, 199, 215, 88))
    return patch


def draw_back_kimono(patch: Image.Image) -> Image.Image:
    w, h = patch.size
    draw = ImageDraw.Draw(patch, "RGBA")
    panel = hydrangea_pattern((50, h), 131, dense=True)
    patch.alpha_composite(panel, (w - 50, 0))
    draw.line((w - 51, 0, w - 51, h), fill=(153, 205, 224, 95), width=2)
    patch.alpha_composite(obi_patch((w, 22)), (0, 87))
    draw.rectangle((0, 0, w - 1, h - 1), outline=(159, 199, 215, 88))
    return patch


def sleeve_patch(size: tuple[int, int], seed: int, floral_edge: bool = False) -> Image.Image:
    patch = kimono_white(size, seed)
    draw = ImageDraw.Draw(patch, "RGBA")
    if floral_edge:
        floral = hydrangea_pattern((max(18, size[0] // 2), size[1]), seed + 300, dense=True)
        patch.alpha_composite(floral, (0, 0))
    draw.rectangle((0, size[1] - 9, size[0], size[1]), fill=(151, 188, 205, 130))
    draw.line((0, size[1] - 10, size[0], size[1] - 10), fill=(86, 132, 157, 120), width=1)
    return patch


def pants_leg_patch(size: tuple[int, int], seed: int, boot: bool = True, floral: bool = False) -> Image.Image:
    patch = hydrangea_pattern(size, seed, dense=True) if floral else kimono_white(size, seed)
    draw = ImageDraw.Draw(patch, "RGBA")
    w, h = size
    for x in range(8, w, 16):
        draw.line((x, 0, x + 4, h - 31), fill=(113, 167, 198, 45), width=1)
    if boot:
        boot_top = h - 37
        draw.rectangle((0, boot_top, w, h), fill=(31, 30, 36, 245))
        draw.polygon([(0, boot_top), (w, boot_top + 5), (w, boot_top + 16), (0, boot_top + 9)], fill=(42, 41, 49, 235))
        draw.line((w // 2, boot_top + 4, w // 2 + 7, h - 4), fill=(154, 149, 158, 80), width=1)
        draw.rectangle((0, h - 8, w, h), fill=(22, 21, 26, 255))
    draw.rectangle((0, 0, w - 1, h - 1), outline=(160, 199, 218, 70))
    return patch


def create_shirt() -> Image.Image:
    img = Image.new("RGBA", CANVAS, (0, 0, 0, 0))

    paste_region(img, TORSO["up"], kimono_white((128, 64), 10))
    paste_region(img, TORSO["right"], kimono_white((64, 128), 20))
    paste_region(img, TORSO["front"], draw_front_kimono(kimono_white((128, 128), 30)))
    paste_region(img, TORSO["left"], kimono_white((64, 128), 40))
    paste_region(img, TORSO["back"], draw_back_kimono(kimono_white((128, 128), 50)))
    paste_region(img, TORSO["down"], kimono_white((128, 64), 60))

    for idx, region in enumerate(RIGHT_LIMB.values()):
        _, _, w, h = region
        paste_region(img, region, sleeve_patch((w, h), 100 + idx, floral_edge=idx in (1, 2)))
    for idx, region in enumerate(LEFT_LIMB.values()):
        _, _, w, h = region
        paste_region(img, region, sleeve_patch((w, h), 200 + idx, floral_edge=idx in (2, 3)))

    return img


def create_pants() -> Image.Image:
    img = Image.new("RGBA", CANVAS, (0, 0, 0, 0))

    paste_region(img, TORSO["up"], kimono_white((128, 64), 310))
    front = kimono_white((128, 128), 320)
    draw = ImageDraw.Draw(front, "RGBA")
    draw_diagonal_panel(front, 321, "right")
    for y in (18, 33, 50, 67, 84):
        draw.arc((-30, y - 34, 150, y + 38), 8, 172, fill=(124, 171, 198, 65), width=2)
    front.alpha_composite(obi_patch((128, 18)), (0, 0))
    paste_region(img, TORSO["front"], front)

    back = hydrangea_pattern((128, 128), 330, dense=True)
    ImageDraw.Draw(back, "RGBA").rectangle((0, 0, 128, 18), fill=(29, 28, 26, 245))
    paste_region(img, TORSO["back"], back)
    paste_region(img, TORSO["right"], kimono_white((64, 128), 340))
    paste_region(img, TORSO["left"], hydrangea_pattern((64, 128), 350, dense=True))
    paste_region(img, TORSO["down"], kimono_white((128, 64), 360))

    right_regions = list(RIGHT_LIMB.items())
    left_regions = list(LEFT_LIMB.items())
    for idx, (_, region) in enumerate(right_regions):
        _, _, w, h = region
        paste_region(img, region, pants_leg_patch((w, h), 410 + idx, boot=h >= 128, floral=idx in (1, 2)))
    for idx, (_, region) in enumerate(left_regions):
        _, _, w, h = region
        paste_region(img, region, pants_leg_patch((w, h), 510 + idx, boot=h >= 128, floral=idx in (2, 3, 4)))
    return img


def create_reference_crop() -> None:
    front = Image.open(SOURCE_FRONT).convert("RGBA")
    face = front.crop((378, 44, 650, 300)).resize((512, 512), Image.Resampling.LANCZOS)
    face.save(OUT / "face_reference_512.png")

    pattern = hydrangea_pattern((512, 512), 777, dense=True)
    pattern = add_snow_motifs(pattern, 778, 16)
    pattern.save(OUT / "kimono_pattern_tile_512.png")


def crop_region(img: Image.Image, region: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = region
    return img.crop((x, y, x + w, y + h))


def create_front_mockup(shirt: Image.Image, pants: Image.Image) -> None:
    mock = Image.new("RGBA", (720, 900), (238, 242, 244, 255))
    draw = ImageDraw.Draw(mock, "RGBA")
    title_font = font(30)
    body_font = font(18)
    draw.text((42, 36), "rough Roblox front mockup", font=title_font, fill=(32, 42, 52, 255))
    draw.text((44, 72), "layout preview only; Studio rendering may differ", font=body_font, fill=(76, 90, 102, 255))

    face = Image.open(OUT / "face_reference_512.png").convert("RGBA")
    face = face.resize((150, 150), Image.Resampling.LANCZOS)
    mock.alpha_composite(face, (285, 118))

    torso = crop_region(shirt, TORSO["front"]).resize((170, 170), Image.Resampling.NEAREST)
    pants_torso = crop_region(pants, TORSO["front"]).resize((170, 120), Image.Resampling.NEAREST)
    right_arm = crop_region(shirt, RIGHT_LIMB["front"]).resize((82, 210), Image.Resampling.NEAREST)
    left_arm = crop_region(shirt, LEFT_LIMB["front"]).resize((82, 210), Image.Resampling.NEAREST)
    right_leg = crop_region(pants, RIGHT_LIMB["front"]).resize((84, 220), Image.Resampling.NEAREST)
    left_leg = crop_region(pants, LEFT_LIMB["front"]).resize((84, 220), Image.Resampling.NEAREST)

    mock.alpha_composite(right_arm, (196, 292))
    mock.alpha_composite(left_arm, (440, 292))
    mock.alpha_composite(torso, (275, 286))
    mock.alpha_composite(pants_torso, (275, 456))
    mock.alpha_composite(right_leg, (278, 570))
    mock.alpha_composite(left_leg, (358, 570))

    for box in [(196, 292, 278, 502), (440, 292, 522, 502), (275, 286, 445, 456), (275, 456, 445, 576), (278, 570, 362, 790), (358, 570, 442, 790)]:
        draw.rectangle(box, outline=(106, 125, 138, 120), width=2)

    mock.convert("RGB").save(OUT / "front_mockup.jpg", quality=92)


def create_preview(shirt: Image.Image, pants: Image.Image) -> None:
    preview = Image.new("RGBA", (1000, 900), (238, 242, 244, 255))
    draw = ImageDraw.Draw(preview, "RGBA")
    title_font = font(34)
    body_font = font(20)
    draw.text((36, 26), "Roblox character asset pack", font=title_font, fill=(32, 42, 52, 255))
    draw.text((38, 70), "white/ice-blue kimono, black-gold obi, flower and snow motifs", font=body_font, fill=(76, 90, 102, 255))

    ref = Image.open(SOURCE_FRONT).convert("RGBA")
    ref.thumbnail((330, 600), Image.Resampling.LANCZOS)
    preview.alpha_composite(ref, (42, 102))

    sw, sh = shirt.size
    shirt_view = Image.new("RGBA", (sw, sh), (222, 226, 229, 255))
    shirt_view.alpha_composite(shirt)
    shirt_view = shirt_view.resize((351, 335), Image.Resampling.NEAREST)
    preview.alpha_composite(shirt_view, (394, 120))
    draw.text((394, 462), "classic shirt PNG", font=body_font, fill=(36, 48, 58, 255))

    pants_view = Image.new("RGBA", (sw, sh), (222, 226, 229, 255))
    pants_view.alpha_composite(pants)
    pants_view = pants_view.resize((351, 335), Image.Resampling.NEAREST)
    preview.alpha_composite(pants_view, (394, 515))
    draw.text((394, 858), "classic pants PNG", font=body_font, fill=(36, 48, 58, 255))

    preview.convert("RGB").save(OUT / "preview_contact_sheet.jpg", quality=92)


def write_docs() -> None:
    (OUT / "README.md").write_text(
        """# Roblox character assets

このフォルダは、添付キャラクターをRobloxで使うための初期アセットです。

## 入っているもの

- `roblox_kimono_shirt.png`: RobloxのClassic Shirt用テンプレートPNGです。
- `roblox_kimono_pants.png`: RobloxのClassic Pants用テンプレートPNGです。袴風の裾、淡青の花柄、黒ブーツを入れています。
- `kimono_pattern_tile_512.png`: 着物柄の調整用タイルです。
- `face_reference_512.png`: 顔を作るときの参照用切り抜きです。Robloxの顔デカールとしてそのまま最適化済みではありません。
- `front_mockup.jpg`: Robloxのブロック体に貼った場合の正面ラフ確認画像です。アップロード用ではありません。
- `roblox_studio_apply_character.lua`: Roblox StudioでNPCやテストリグに服IDを入れるためのLuaです。
- `character_build_spec.md`: 髪型、顔、帯、扇子など、3D側で追加すべき要素の指示書です。

## Roblox Studioで確認する手順

1. Roblox Creator Dashboardで `roblox_kimono_shirt.png` をClassic Shirtとしてアップロードします。
2. `roblox_kimono_pants.png` をClassic Pantsとしてアップロードします。
3. アップロード後に得た2つのアセットIDを `roblox_studio_apply_character.lua` の `SHIRT_ASSET_ID` と `PANTS_ASSET_ID` に入れます。
4. Roblox StudioでR15またはBlock AvatarのRigを置き、Luaを実行して見た目を確認します。

公式ドキュメントでは、Classic Shirt/Pantsは585x559 PNGテンプレートとして作成し、Studioでテストしてからアップロードする流れです。
参考: https://create.roblox.com/docs/art/classic-clothing
参考: https://create.roblox.com/docs/art/test-classic-clothing
参考: https://create.roblox.com/docs/art/upload-classic-clothing

## 注意

このPNGだけで再現できるのは、胴体・腕・脚に貼る2D服です。銀髪のボブ、青い目、広い着物袖の厚み、扇子、帯の立体結びはRobloxのアクセサリやBlender制作が必要です。
""",
        encoding="utf-8",
    )

    (OUT / "character_build_spec.md").write_text(
        """# Character build spec for Roblox

## 目標

添付キャラクターをRobloxで再現する。服は白基調の和装、淡い水色の花柄、薄い雪輪/結晶模様、黒金の帯、黒いヒールブーツを優先する。

## Roblox Classic Clothingで再現済み

- 白地の着物上衣
- 淡い水色の花柄パネル
- 薄い雪輪/結晶模様
- 黒金の帯と前垂れ
- 袴風の長い裾
- 黒いブーツ

## 追加でStudio/Marketplace/Blender側に必要なもの

- 髪: 銀白から薄青のボブ。横髪は頬に沿う長さ。後ろは低めの短いポニーテールまたは外ハネの房。
- 顔: 大きめの青い目、薄い眉、淡い頬紅、口は小さめ。
- 体型: R15推奨。頭はやや大きめ、身長は低めから標準、体幅は細め。
- 首元: 灰青のハイカラー、その下に白いボタン列。
- 腰: 黒い帯。金の細い文様。前側に長い垂れを2本。
- 小物: 閉じた扇子を左腰前に差す。扇子は茶色の骨と白い紙面。
- シルエット: 着物袖は長く広い。クラシック服だけでは袖の厚みは出ないため、忠実にするなら左右袖をLayered ClothingまたはRigid Accessoryで作る。

## 色指定

- 髪: `#e9eef8`, 影 `#8795b4`, ハイライト `#ffffff`
- 目: `#2f73b9`, ハイライト `#dff4ff`
- 着物白: `#f6fcff`
- 花柄水色: `#8fd3ed`, `#bfe7f6`, `#b6c7f5`
- 模様線: `#9bd1df`
- 帯: `#1d1c1a`
- 帯の金: `#9e7e4d`
- ブーツ: `#1f1e24`

## 次に忠実度を上げる場合

1. Roblox StudioでClassic Shirt/Pantsを適用してスクリーンショットを取る。
2. 袖・帯垂れ・扇子を別アクセサリとして作る。
3. 髪を近いMarketplace品で仮置きし、合わなければBlenderでHairAccessoryとして作る。
4. 顔は既存Roblox faceで近いものを使うか、ゲーム内NPCならHead正面にDecalを貼る。
""",
        encoding="utf-8",
    )

    (OUT / "roblox_studio_apply_character.lua").write_text(
        """-- Roblox Studio helper.
-- Upload the two PNG files first, then replace the numeric IDs below.

local SHIRT_ASSET_ID = 0
local PANTS_ASSET_ID = 0

local function assetUrl(id)
	if id == 0 then
		return ""
	end
	return "rbxassetid://" .. tostring(id)
end

local function applyCharacterLook(character)
	local shirt = character:FindFirstChildOfClass("Shirt") or Instance.new("Shirt")
	shirt.Name = "FaithfulKimonoShirt"
	shirt.ShirtTemplate = assetUrl(SHIRT_ASSET_ID)
	shirt.Parent = character

	local pants = character:FindFirstChildOfClass("Pants") or Instance.new("Pants")
	pants.Name = "FaithfulKimonoPants"
	pants.PantsTemplate = assetUrl(PANTS_ASSET_ID)
	pants.Parent = character

	local bodyColors = character:FindFirstChildOfClass("BodyColors") or Instance.new("BodyColors")
	local skin = BrickColor.new("Light orange")
	bodyColors.HeadColor = skin
	bodyColors.LeftArmColor = skin
	bodyColors.RightArmColor = skin
	bodyColors.LeftLegColor = skin
	bodyColors.RightLegColor = skin
	bodyColors.TorsoColor = skin
	bodyColors.Parent = character
end

local selected = game:GetService("Selection"):Get()
if selected and selected[1] then
	applyCharacterLook(selected[1])
else
	warn("Select an R15/R6 rig or character model before running this script.")
end
""",
        encoding="utf-8",
    )


def main() -> None:
    OUT.mkdir(exist_ok=True)
    shirt = create_shirt()
    pants = create_pants()
    shirt.save(OUT / "roblox_kimono_shirt.png")
    pants.save(OUT / "roblox_kimono_pants.png")
    create_reference_crop()
    create_front_mockup(shirt, pants)
    create_preview(shirt, pants)
    write_docs()


if __name__ == "__main__":
    main()
