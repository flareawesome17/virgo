"""
The hero film (docs/redesign/05-cinema.md §1.11): a dark studio, the crew's
gear lit like a product film. The cinema camera is the hero piece, large and
close at three-quarters, its lens catching a warm key light and a gold rim.
The photographer's camera sits soft behind it. There is haze with a light beam
through it, a dark reflective floor, and dust drifting in front of the lens.

Two parts, rendered frame by frame from one function of time, so every frame
is reproducible on its own:
- intro (once, 2.5 s): black, the softbox flickers on, the rim comes up, and the
  camera dollies in. Its last frame is the loop's first.
- loop (seamless, 5 s): a slow orbit, the light breathing, the haze drifting
  on a circle through noise space, motes on closed paths, and a glint that
  crosses the lens glass. Phase θ = 2πk/N, so frame N is frame 0.

Run from marketing-assets/ (Blender 5.2, Cycles on the CPU):
  blender -b --factory-startup -P blender/hero_film.py -- \
      --part loop --frames 0:144 --res 1280x720 --samples 64 --out out/film/loop

Models (third-party, CC BY, credited on the site) are read from models/, which
is not in git: see models/README in the PR description. Without them the
stage renders with stand-ins, which is how the light was tuned.
"""

import argparse
import math
import os
import random
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gear_models  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"

FPS = 24
INTRO = 60  # 2.5 s
LOOP = 120  # 5 s

# The hero's turn about z: its lens (local −X) toward the viewer and a little left.
HERO_YAW = 52

# The palette (design/tokens): warm key, gold rim, copper beam.
KEY = (1.0, 0.80, 0.60)
RIM = (1.0, 0.70, 0.40)
BEAM = (1.0, 0.74, 0.48)


# ─── Arguments ───────────────────────────────────────────────────────────


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--part", choices=["intro", "loop", "still"], default="still")
    p.add_argument("--frames", default="0:1", help="a:b, frames of the part (b exclusive)")
    p.add_argument("--res", default="1280x720")
    p.add_argument("--aspect", choices=["wide", "tall"], default="wide")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--out", default="out/film/still", help="relative to marketing-assets/")
    p.add_argument("--save-blend", default="")
    p.add_argument("--no-haze", action="store_true")
    return p.parse_args(argv)


# ─── Helpers ─────────────────────────────────────────────────────────────


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease(t):
    """Cubic in-out: camera moves."""
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def lerp(a, b, t):
    return a + (b - a) * t


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def principled(name, base, rough=0.5, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    return m


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


# ─── Models ──────────────────────────────────────────────────────────────


def find_model(keyword):
    """A .glb, or a glTF folder (scene.gltf), or a Sketchfab zip, whose path names `keyword`."""
    if not MODELS.exists():
        return None
    for z in MODELS.glob("*.zip"):
        if keyword in z.name.lower():
            dest = MODELS / z.stem
            if not dest.exists():
                with zipfile.ZipFile(z) as f:
                    f.extractall(dest)
    for p in sorted(MODELS.rglob("*")):
        if p.suffix.lower() in (".glb", ".gltf") and keyword in str(p.relative_to(MODELS)).lower():
            return p
    return None


def import_model(path, length, name):
    """Imports a glTF, parents it to an empty, and scales it so its longest side is `length` m, resting on the floor."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objs = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    size = hi - lo
    s = length / max(size)
    root.scale = (s, s, s)
    centre = (lo + hi) / 2
    root.location = (-centre.x * s, -centre.y * s, -lo.z * s)
    bpy.context.view_layer.update()
    return root, size * s


def stand_in(name, length):
    """A body and a lens, for tuning the light before the models arrive."""
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    body_mat = principled(f"{name}-body", (0.02, 0.02, 0.022), rough=0.35, metal=0.0)
    metal_mat = principled(f"{name}-metal", (0.6, 0.6, 0.62), rough=0.25, metal=1.0)
    bpy.ops.mesh.primitive_cube_add(size=1)
    body = bpy.context.object
    body.scale = (length * 0.55, length * 0.4, length * 0.42)
    body.location = (length * 0.2, 0, length * 0.21)
    bpy.ops.object.modifier_add(type="BEVEL")
    body.modifiers["Bevel"].width = length * 0.03
    body.modifiers["Bevel"].segments = 4
    body.data.materials.append(body_mat)
    body.parent = root
    bpy.ops.mesh.primitive_cylinder_add(radius=length * 0.13, depth=length * 0.45, vertices=96)
    lens = bpy.context.object
    lens.rotation_euler = (0, math.radians(90), 0)
    lens.location = (-length * 0.25, 0, length * 0.21)
    lens.data.materials.append(metal_mat)
    lens.parent = root
    return root, Vector((length, length * 0.4, length * 0.42))


# ─── The stage ───────────────────────────────────────────────────────────


class Stage:
    def __init__(self, args):
        self.args = args
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        self.scene = sc
        w, h = (int(v) for v in args.res.split("x"))
        sc.render.resolution_x, sc.render.resolution_y = w, h
        sc.render.fps = FPS
        sc.render.engine = "CYCLES"
        sc.cycles.device = "CPU"
        sc.cycles.samples = args.samples
        sc.cycles.adaptive_threshold = 0.03
        sc.cycles.use_denoising = True
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
        sc.cycles.max_bounces = 6
        sc.cycles.diffuse_bounces = 2
        sc.cycles.glossy_bounces = 3
        sc.cycles.transmission_bounces = 6
        sc.cycles.volume_bounces = 1
        sc.cycles.transparent_max_bounces = 8
        sc.render.use_persistent_data = True
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
        sc.view_settings.exposure = 0.0
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_depth = "8"
        sc.render.film_transparent = False

        self.world()
        self.floor()
        self.gear()
        self.lights()
        if not args.no_haze:
            self.haze()
        else:
            self.haze_mapping = None
        self.bokeh()
        self.motes()
        self.camera()

    # The world: black to the camera, a dim studio in the reflections.
    def world(self):
        wd = bpy.data.worlds.new("World")
        self.scene.world = wd
        wd.use_nodes = True
        nt = wd.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputWorld")
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        hdr = MODELS / "studio_small_09_2k.hdr"
        if hdr.exists():
            env.image = bpy.data.images.load(str(hdr))
        bg_refl = nt.nodes.new("ShaderNodeBackground")
        bg_refl.inputs["Strength"].default_value = 0.1
        bg_cam = nt.nodes.new("ShaderNodeBackground")
        bg_cam.inputs["Color"].default_value = (0.006, 0.005, 0.0045, 1)
        lp = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mapping = nt.nodes.new("ShaderNodeMapping")
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(140))
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs[0], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], bg_refl.inputs["Color"])
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(bg_refl.outputs[0], mix.inputs[1])
        nt.links.new(bg_cam.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])

    # A dark, slightly glossy floor that reflects the gear and the light.
    def floor(self):
        bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
        fl = bpy.context.object
        m = principled("floor", (0.0035, 0.003, 0.0028), rough=0.5, spec=0.28)
        nt = m.node_tree
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 60
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["To Min"].default_value = 0.38
        ramp.inputs["To Max"].default_value = 0.62
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
        nt.links.new(ramp.outputs[0], nt.nodes["Principled BSDF"].inputs["Roughness"])
        fl.data.materials.append(m)

    def gear(self):
        # Downloaded models win if they are there (models/README); otherwise the gear is built in code.
        cine = find_model("cinema")
        photo = next((p for p in (MODELS.rglob("*.gl*") if MODELS.exists() else []) if "cinema" not in str(p).lower() and p.suffix.lower() in (".glb", ".gltf")), None)
        if cine:
            self.hero, self.hero_size = import_model(cine, 0.26, "hero")
        else:
            self.hero = gear_models.cine_camera("hero")
            self.hero_size = Vector((0.26, 0.105, 0.19))
        # The cine camera's lens (local −X) turned toward the viewer, three-quarters.
        self.hero.rotation_euler = (0, 0, math.radians(HERO_YAW))

        if photo:
            self.second, _ = import_model(photo, 0.17, "second")
        else:
            self.second = gear_models.mirrorless("second")
        self.second.location = (-0.34, 0.55, 0)
        self.second.rotation_euler = (0, 0, math.radians(-24))

        self.spare = gear_models.spare_prime("spare")
        self.spare.location = (0.2, -0.24, 0)
        self.spare.rotation_euler = (0, 0, math.radians(-120))

        # The point the camera focuses on: the front of the hero's lens.
        self.focus = bpy.data.objects.new("focus", None)
        bpy.context.collection.objects.link(self.focus)
        a = math.radians(HERO_YAW)
        reach = 0.175
        self.focus.location = (-math.cos(a) * reach, -math.sin(a) * reach, 0.064)

    def lights(self):
        def area(name, size, color, energy, loc, target, shape="RECTANGLE", size_y=None):
            d = bpy.data.lights.new(name, "AREA")
            d.shape = shape
            d.size = size
            if size_y:
                d.size_y = size_y
            d.color = color
            d.energy = energy
            o = bpy.data.objects.new(name, d)
            bpy.context.collection.objects.link(o)
            o.location = loc
            o.visible_camera = False
            look_at(o, target)
            return o

        t = (0, 0, 0.1)
        self.key = area("key", 0.7, KEY, 70, (-0.75, -0.45, 0.65), t, shape="DISK")
        self.rim = area("rim", 0.06, RIM, 220, (0.3, 0.6, 0.48), t, size_y=0.7)
        self.fill = area("fill", 1.2, (0.9, 0.86, 0.82), 2, (0.9, -0.9, 0.3), t)
        self.glint = area("glint", 0.03, (1.0, 0.93, 0.82), 0, (0, -0.5, 0.2), t)
        sd = bpy.data.lights.new("beam", "SPOT")
        sd.color = BEAM
        sd.energy = 300
        sd.spot_size = math.radians(19)
        sd.spot_blend = 0.5
        self.beam = bpy.data.objects.new("beam", sd)
        bpy.context.collection.objects.link(self.beam)
        self.beam.location = (-0.9, 1.4, 1.6)
        look_at(self.beam, (-0.02, 0.0, 0.1))
        self.base = {"key": 60, "rim": 220, "fill": 0.6, "beam": 260}

    # Haze: a box of thin volume whose density is noise, drifting on a circle (seamless).
    def haze(self):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.6, 0.8))
        box = bpy.context.object
        box.scale = (5, 5, 1.6)
        m = bpy.data.materials.new("haze")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (1.0, 0.93, 0.86, 1)
        vol.inputs["Anisotropy"].default_value = 0.55
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 1.6
        noise.inputs["Detail"].default_value = 3
        rng = nt.nodes.new("ShaderNodeMapRange")
        rng.inputs["To Min"].default_value = 0.0004
        rng.inputs["To Max"].default_value = 0.0035
        rng.inputs["From Min"].default_value = 0.35
        rng.inputs["From Max"].default_value = 0.7
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs[0], noise.inputs["Vector"])
        nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
        nt.links.new(rng.outputs[0], vol.inputs["Density"])
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
        box.data.materials.append(m)
        self.haze_mapping = mapping

    # Far practicals: small warm lights behind, which the lens turns into bokeh.
    def bokeh(self):
        rnd = random.Random(9)
        mat = emission("bokeh", (1.0, 0.72, 0.42), 25)
        for i in range(9):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.006, location=(rnd.uniform(-1.6, 1.6), rnd.uniform(2.4, 4.2), rnd.uniform(0.15, 0.9)))
            bpy.context.object.data.materials.append(mat)

    # Dust near the lens: tiny bright motes on closed paths (seamless).
    def motes(self):
        rnd = random.Random(4)
        mat = emission("mote", (1.0, 0.9, 0.75), 4)
        self.mote_objs = []
        for i in range(16):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=rnd.uniform(0.0008, 0.0018), segments=8, ring_count=6)
            o = bpy.context.object
            o.data.materials.append(mat)
            self.mote_objs.append(
                (
                    o,
                    Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.3, 0.3), rnd.uniform(0.05, 0.42))),
                    rnd.uniform(0.01, 0.04),
                    rnd.uniform(0, math.tau),
                )
            )

    def camera(self):
        cd = bpy.data.cameras.new("cam")
        cd.lens = 58 if self.args.aspect == "wide" else 42
        cd.sensor_fit = "HORIZONTAL" if self.args.aspect == "wide" else "VERTICAL"
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = 1.8
        cd.dof.focus_object = self.focus
        cd.dof.aperture_blades = 7
        cd.dof.aperture_rotation = math.radians(12)
        self.cam = bpy.data.objects.new("cam", cd)
        bpy.context.collection.objects.link(self.cam)
        self.scene.camera = self.cam

    # ─── Time ──────────────────────────────────────────────────────────

    def pose(self, part, k):
        """Every moving thing, from (part, frame)."""
        wide = self.args.aspect == "wide"
        # Where the camera rests at the loop's start; the hero sits right of centre on wide, centred on tall.
        az0, el0, dist0 = math.radians(-12), math.radians(9), 0.78 if wide else 0.92
        target = Vector((-0.07, 0.0, 0.09)) if wide else Vector((0.0, 0.02, 0.1))

        if part == "intro":
            t = k / INTRO
            d = ease(t)
            az = az0 + math.radians(-16) * (1 - d)
            el = el0 + math.radians(6) * (1 - d)
            dist = dist0 * lerp(1.55, 1.0, d)
            # Lights: the softbox flickers on, the rim follows, the beam last.
            flick = [0, 0, 0, 0, 0.0, 0.6, 0.1, 0.9, 0.3, 1.0]
            fi = int(t * 40)
            key = (flick[fi] if fi < len(flick) else 1.0) * self.base["key"]
            rim = smooth((t - 0.3) / 0.25) * self.base["rim"]
            beam = smooth((t - 0.45) / 0.3) * self.base["beam"]
            fill = smooth((t - 0.2) / 0.4) * self.base["fill"]
            theta = 0.0
            glint = 0.0
        else:
            theta = math.tau * k / LOOP
            breathe = (1 - math.cos(theta)) / 2
            az = az0 + math.radians(7) * math.sin(theta)
            el = el0 + math.radians(1.5) * breathe
            dist = dist0 * (1 - 0.035 * breathe)
            key = self.base["key"] * (1 + 0.05 * math.sin(theta))
            rim = self.base["rim"] * (1 + 0.08 * math.sin(theta + 1.2))
            beam = self.base["beam"]
            fill = self.base["fill"]
            u = k / LOOP
            glint = 60 * math.sin(math.pi * u) ** 6
            self.glint.location = (lerp(-0.45, 0.45, u), -0.42, lerp(0.05, 0.32, u))
            look_at(self.glint, (-0.06, -0.08, 0.1))

        # Camera: an orbit round the target.
        self.cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
        look_at(self.cam, target)

        self.key.data.energy = key
        self.rim.data.energy = rim
        self.beam.data.energy = beam
        self.fill.data.energy = fill
        self.glint.data.energy = glint

        # Haze drifts on a circle through noise space; motes ride their loops.
        r = 0.35
        if self.haze_mapping is not None:
            self.haze_mapping.inputs["Location"].default_value = (r * math.cos(theta), r * math.sin(theta), 0.12 * math.sin(theta))
        for o, c, rad, ph in self.mote_objs:
            o.location = c + Vector((rad * math.cos(theta + ph), rad * 0.6 * math.sin(theta + ph), rad * 0.8 * math.sin(2 * (theta + ph))))

    def render(self, part, a, b, out):
        out = str((ROOT / out).resolve()) if not os.path.isabs(out) else out
        os.makedirs(out, exist_ok=True)
        for k in range(a, b):
            self.pose(part, k)
            self.scene.render.filepath = os.path.join(out, f"{part}_{k:04d}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[hero-film] {part} {k} → {self.scene.render.filepath}", flush=True)


def main():
    args = parse()
    stage = Stage(args)
    if args.save_blend:
        stage.pose("loop", 0)
        bpy.ops.wm.save_as_mainfile(filepath=args.save_blend)
    a, b = (int(v) for v in args.frames.split(":"))
    part = "loop" if args.part == "still" else args.part
    stage.render(part, a, b, args.out)


main()
