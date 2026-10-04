"""
The gear for the hero film, built in code: a modern cine camera with a cine
prime, a mirrorless camera with a zoom, and a spare prime. Generic and
unbranded by construction (no logos, no real product's lines), so the film
needs no third-party models or licences.

Realism comes from what light catches: rounded edges on everything (bevels),
knurled and geared rings, coated glass with depth behind it, and materials
that differ the way real ones do (anodised metal, brushed rings, rubber,
leatherette, glass). Units are metres; each builder returns an empty that
parents its parts, with its base on z = 0. The cine camera's lens points
along local −X; the mirrorless camera's along local −Y.
"""

import math

import bpy
from mathutils import Matrix, Vector

# ─── Materials ───────────────────────────────────────────────────────────

_cache: dict[str, bpy.types.Material] = {}


def _bsdf(name, base, rough, metal=0.0, spec=0.5):
    if name in _cache:
        return _cache[name], None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    _cache[name] = m
    return m, b


def _micro(m, b, scale, strength, rough_from, rough_to):
    """Fine surface variation: noise into roughness and a faint bump, so highlights break up like real finishes."""
    nt = m.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6
    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.inputs["To Min"].default_value = rough_from
    rng.inputs["To Max"].default_value = rough_to
    nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
    nt.links.new(rng.outputs[0], b.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.0002
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], b.inputs["Normal"])


def mats():
    out = {}
    m, b = _bsdf("anodised", (0.016, 0.016, 0.018), 0.34, metal=1.0)
    if b:
        _micro(m, b, 900, 0.08, 0.28, 0.42)
    out["anodised"] = m
    m, b = _bsdf("gunmetal", (0.09, 0.085, 0.08), 0.3, metal=1.0)
    if b:
        _micro(m, b, 700, 0.06, 0.24, 0.36)
    out["gunmetal"] = m
    m, b = _bsdf("brushed", (0.62, 0.6, 0.58), 0.2, metal=1.0)
    if b:
        b.inputs["Anisotropic"].default_value = 0.7
    out["brushed"] = m
    m, b = _bsdf("copper", (0.78, 0.45, 0.25), 0.25, metal=1.0)
    out["copper"] = m
    m, b = _bsdf("rubber", (0.011, 0.011, 0.011), 0.72, spec=0.3)
    if b:
        _micro(m, b, 300, 0.25, 0.62, 0.85)
    out["rubber"] = m
    m, b = _bsdf("leather", (0.007, 0.0065, 0.006), 0.62, spec=0.35)
    if b:
        nt = m.node_tree
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 1400
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        bump.inputs["Distance"].default_value = 0.0003
        nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], b.inputs["Normal"])
    out["leather"] = m
    m, b = _bsdf("plastic", (0.028, 0.027, 0.027), 0.48)
    if b:
        _micro(m, b, 500, 0.05, 0.42, 0.55)
    out["plastic"] = m
    m, b = _bsdf("void", (0.002, 0.002, 0.002), 0.5, spec=0.2)
    out["void"] = m
    m, b = _bsdf("glass", (1, 1, 1), 0.0)
    if b:
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["IOR"].default_value = 1.52
        # The anti-reflection coating: the green-violet sheen of real lens glass.
        if "Thin Film Thickness" in b.inputs:
            b.inputs["Thin Film Thickness"].default_value = 260
            b.inputs["Thin Film IOR"].default_value = 1.38
    out["glass"] = m
    m, b = _bsdf("glass-inner", (1, 1, 1), 0.0)
    if b:
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["IOR"].default_value = 1.6
    out["glass-inner"] = m
    m, b = _bsdf("red", (0.55, 0.03, 0.02), 0.3)
    if b:
        b.inputs["Emission Color"].default_value = (1, 0.06, 0.03, 1)
        b.inputs["Emission Strength"].default_value = 3.0
    out["tally"] = m
    m, b = _bsdf("screen", (0.01, 0.01, 0.01), 0.08, spec=0.6)
    if b:
        nt = m.node_tree
        grad = nt.nodes.new("ShaderNodeTexGradient")
        coord = nt.nodes.new("ShaderNodeTexCoord")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.05, 0.03, 0.02, 1)
        ramp.color_ramp.elements[1].color = (0.9, 0.55, 0.3, 1)
        nt.links.new(coord.outputs["Generated"], grad.inputs["Vector"])
        nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 0.9
    out["screen"] = m
    m, b = _bsdf("white-ink", (0.85, 0.82, 0.78), 0.4)
    out["ink"] = m
    return out


# ─── Primitives ──────────────────────────────────────────────────────────


def _finish(o, mat, parent, smooth=True):
    if mat:
        o.data.materials.append(mat)
    if smooth:
        o.data.shade_smooth()
    if parent:
        o.parent = parent
    return o


def box(size, loc, mat, parent, bevel=0.003, seg=4, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = "ANGLE"
        mod.harden_normals = True
    return _finish(o, mat, parent)


def cyl(r, depth, loc, mat, parent, axis="X", verts=96, bevel=0.0012, r2=None):
    """A cylinder (or a cone when r2 is set) along an axis."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc)
    o = bpy.context.object
    if axis == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    elif axis == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
        mod.harden_normals = True
    return _finish(o, mat, parent)


def tube(r, depth, loc, mat, parent, axis="X", wall=0.0028, verts=96):
    """An open tube (a lens hood, a barrel mouth): no end caps, a real wall."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, end_fill_type="NOTHING")
    o = bpy.context.object
    if axis == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    elif axis == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
    sol = o.modifiers.new("wall", "SOLIDIFY")
    sol.thickness = wall
    sol.offset = -1
    bev = o.modifiers.new("bevel", "BEVEL")
    bev.width = wall * 0.4
    bev.segments = 2
    return _finish(o, mat, parent)


def teeth(r, depth, count, tooth, center, mat, parent, axis="X"):
    """A ring of teeth (a focus gear, knurling) round an axis: one tooth, arrayed by rotation."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.data.transform(Matrix.Diagonal((tooth[0], tooth[1], depth, 1.0)))
    o.data.transform(Matrix.Translation((0, r, 0)))
    o.location = center
    if axis == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    elif axis == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
    pivot = bpy.data.objects.new(o.name + "-pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent = o
    pivot.rotation_euler = (0, 0, math.tau / count)
    arr = o.modifiers.new("ring", "ARRAY")
    arr.use_relative_offset = False
    arr.use_object_offset = True
    arr.offset_object = pivot
    arr.count = count
    bev = o.modifiers.new("bevel", "BEVEL")
    bev.width = min(tooth) * 0.25
    bev.segments = 2
    return _finish(o, mat, parent, smooth=False)


def root(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    return e


# ─── A cine prime ────────────────────────────────────────────────────────


def cine_prime(m, parent, x0, z, r=0.034, length=0.105):
    """A cine prime along −X from x0: mount, geared focus and iris rings, a copper ring, and a deep front element."""
    x = x0
    cyl(r * 0.92, 0.008, (x - 0.004, 0, z), m["brushed"], parent)
    x -= 0.008
    cyl(r, 0.02, (x - 0.01, 0, z), m["anodised"], parent)
    x -= 0.02
    cyl(r * 1.04, 0.016, (x - 0.008, 0, z), m["rubber"], parent)
    teeth(r * 1.04, 0.014, 72, (0.0018, 0.0026), (x - 0.008, 0, z), m["anodised"], parent)
    x -= 0.018
    cyl(r, 0.012, (x - 0.006, 0, z), m["anodised"], parent)
    cyl(r * 1.005, 0.0022, (x - 0.006, 0, z), m["copper"], parent, bevel=0.0004)
    x -= 0.012
    cyl(r * 1.06, 0.024, (x - 0.012, 0, z), m["rubber"], parent)
    teeth(r * 1.06, 0.022, 96, (0.0016, 0.003), (x - 0.012, 0, z), m["gunmetal"], parent)
    x -= 0.026
    front = length - (x0 - x)
    tube(r * 1.16, front, (x - front / 2, 0, z), m["anodised"], parent)
    x -= front
    # The front element: a dark tube with glass at its mouth and two elements inside, so the glass has depth.
    tube(r * 1.0, 0.03, (x + 0.016, 0, z), m["void"], parent, wall=0.002)
    cyl(r * 0.9, 0.002, (x + 0.034, 0, z), m["void"], parent, bevel=0)
    for i, depth in enumerate((0.003, 0.016, 0.03)):
        cyl(r * (0.98 - i * 0.12), 0.0025, (x + depth, 0, z), m["glass" if i == 0 else "glass-inner"], parent, verts=96, bevel=0.0008)
    # The iris inside: a dark ring a little way back, which gives the glass its depth.
    tube(r * 0.62, 0.002, (x + 0.024, 0, z), m["gunmetal"], parent, wall=r * 0.3)
    # The lip: a thin bright edge that catches the rim light.
    tube(r * 1.17, 0.003, (x + 0.0015, 0, z), m["brushed"], parent, wall=0.003)
    return x


# ─── The cine camera (the hero) ──────────────────────────────────────────


def cine_camera(name="hero"):
    m = mats()
    g = root(name)
    L, W, H = 0.135, 0.105, 0.105
    zc = 0.012 + H / 2
    # Body: anodised with gunmetal side plates and heat-sink fins on top.
    box((L, W, H), (0, 0, zc), m["anodised"], g, bevel=0.007, seg=5)
    for side in (-1, 1):
        box((L * 0.82, 0.004, H * 0.7), (0.004, side * (W / 2 + 0.0015), zc), m["gunmetal"], g, bevel=0.0015)
    for i in range(9):
        box((0.004, W * 0.72, 0.009), (-L * 0.32 + i * 0.012, 0, 0.012 + H + 0.0035), m["gunmetal"], g, bevel=0.0012, seg=2)
    # The mount face, the REC button and the tally light.
    cyl(0.04, 0.006, (-L / 2 - 0.002, 0, zc), m["brushed"], g)
    cyl(0.006, 0.004, (-L / 2 + 0.01, -W / 2 - 0.001, zc + 0.03), m["tally"], g, axis="Y", verts=32, bevel=0.0006)
    cyl(0.0035, 0.004, (-L / 2 + 0.006, -W / 2 + 0.012, 0.012 + H + 0.001), m["tally"], g, axis="Z", verts=24, bevel=0.0005)
    # Battery on the back.
    box((0.03, W * 0.86, H * 0.8), (L / 2 + 0.016, 0, zc - 0.004), m["plastic"], g, bevel=0.005)
    # Top handle on two posts, with a cheese plate.
    box((L * 0.9, 0.05, 0.005), (0, 0, 0.012 + H + 0.012), m["anodised"], g, bevel=0.0015)
    for x in (-L * 0.32, L * 0.3):
        box((0.012, 0.018, 0.03), (x, 0, 0.012 + H + 0.028), m["anodised"], g, bevel=0.003)
    box((L * 0.86, 0.026, 0.016), (-0.005, 0, 0.012 + H + 0.05), m["rubber"], g, bevel=0.006, seg=5)
    # Base plate and 15 mm rods under the lens.
    box((L * 1.05, W * 0.8, 0.012), (0.004, 0, 0.006), m["anodised"], g, bevel=0.002)
    for y in (-0.03, 0.03):
        cyl(0.0075, 0.16, (-0.06, y, 0.02), m["brushed"], g, verts=48)
    # The cine prime and a follow-focus unit on the rods, its gear against the lens.
    cine_prime(m, g, -L / 2 - 0.004, zc)
    box((0.03, 0.03, 0.03), (-L / 2 - 0.06, -0.045, 0.034), m["anodised"], g, bevel=0.004)
    cyl(0.013, 0.012, (-L / 2 - 0.06, -0.045, 0.05), m["gunmetal"], g, axis="Y", verts=48)
    return g


# ─── A mirrorless camera with a zoom ─────────────────────────────────────


def mirrorless(name="second"):
    m = mats()
    g = root(name)
    L, W, H = 0.128, 0.068, 0.086
    zc = H / 2
    box((L, W * 0.62, H), (0, 0.008, zc), m["leather"], g, bevel=0.008, seg=5)
    # Grip on the right, top plate, EVF hump, mode dial, shutter.
    box((0.03, W, H * 0.98), (L / 2 - 0.016, -0.004, zc), m["leather"], g, bevel=0.012, seg=6)
    box((L * 1.0, W * 0.64, 0.012), (0, 0.008, H + 0.004), m["gunmetal"], g, bevel=0.004)
    box((0.036, W * 0.6, 0.024), (0.0, 0.01, H + 0.018), m["gunmetal"], g, bevel=0.006, seg=5)
    cyl(0.011, 0.008, (L / 2 - 0.022, 0.012, H + 0.014), m["gunmetal"], g, axis="Z", verts=48)
    teeth(0.011, 0.007, 60, (0.0012, 0.0012), (L / 2 - 0.022, 0.012, H + 0.014), m["brushed"], g, axis="Z")
    cyl(0.005, 0.004, (L / 2 - 0.012, -0.012, H + 0.012), m["brushed"], g, axis="Z", verts=32)
    # The zoom: mount, ribbed zoom ring, focus ring, hood.
    x = -W * 0.2
    cyl(0.03, 0.006, (0, -0.018, zc), m["brushed"], g, axis="Y")
    cyl(0.031, 0.03, (0, -0.036, zc), m["plastic"], g, axis="Y")
    cyl(0.033, 0.024, (0, -0.064, zc), m["rubber"], g, axis="Y")
    teeth(0.033, 0.022, 90, (0.0015, 0.0018), (0, -0.064, zc), m["rubber"], g, axis="Y")
    cyl(0.031, 0.018, (0, -0.085, zc), m["plastic"], g, axis="Y")
    cyl(0.032, 0.012, (0, -0.1, zc), m["rubber"], g, axis="Y")
    cyl(0.0275, 0.006, (0, -0.107, zc), m["void"], g, axis="Y", bevel=0)
    cyl(0.026, 0.002, (0, -0.109, zc), m["glass"], g, axis="Y", bevel=0.0006)
    cyl(0.0288, 0.0015, (0, -0.1095, zc), m["brushed"], g, axis="Y", bevel=0.0004)
    del x
    return g


def spare_prime(name="spare"):
    """A prime lying on its side on the floor, for the foreground."""
    m = mats()
    g = root(name)
    cine_prime(m, g, 0.05, 0.036, r=0.028, length=0.09)
    return g
