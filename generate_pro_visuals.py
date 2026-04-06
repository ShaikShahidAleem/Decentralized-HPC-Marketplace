import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import matplotlib.image as mpimg
import os

OUTPUT_DIR = r"c:\Capstone Project\presentation_visuals_pro"
ICON_DIR = r"c:\Capstone Project\resources\icons"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# Style Constants
STYLE = {
    'bg': '#ffffff',
    'group_bg': '#f3f4f6',
    'group_border': '#d1d5db',
    'text': '#1f2937',
    'accent': '#0078d4', # Azure Blue
    'connector': '#4b5563',
    'font_family': 'sans-serif'
}

def load_icon(name, zoom=0.15):
    path = os.path.join(ICON_DIR, f"{name}.png")
    if os.path.exists(path):
        return mpimg.imread(path)
    return None

def draw_icon_node(ax, x, y, icon_name, label, zoom=0.1):
    # Icon
    img = load_icon(icon_name)
    if img is not None:
        im = OffsetImage(img, zoom=zoom)
        ab = AnnotationBbox(im, (x, y), frameon=False, pad=0)
        ax.add_artist(ab)
    
    # Label
    ax.text(x, y - 0.08, label, ha='center', va='top', 
            fontsize=9, weight='bold', color=STYLE['text'], 
            bbox=dict(facecolor='white', alpha=0.8, edgecolor='none', pad=2))

def draw_group_box(ax, x, y, w, h, label):
    # Draw logic is bottom-left based for Rectangle, but we center coordinates usually. 
    # Let's use (x,y) as bottom-left
    rect = patches.FancyBboxPatch((x, y), w, h, 
                                 boxstyle="round,pad=0.02", 
                                 linewidth=1, edgecolor=STYLE['group_border'], 
                                 facecolor=STYLE['group_bg'], zorder=0)
    ax.add_patch(rect)
    ax.text(x + 0.02, y + h - 0.05, label, ha='left', va='top', 
            fontsize=10, weight='bold', color=STYLE['connector'])

def connect(ax, p1, p2, style="-", color=STYLE['connector']):
    # Simple straight line connector
    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=color, linestyle=style, zorder=1)

def connect_ortho(ax, p1, p2, color=STYLE['connector']):
    # Orthogonal connector (horizontal first then vertical)
    mid_x = (p1[0] + p2[0]) / 2
    ax.plot([p1[0], mid_x], [p1[1], p1[1]], color=color, zorder=1)
    ax.plot([mid_x, mid_x], [p1[1], p2[1]], color=color, zorder=1)
    ax.plot([mid_x, p2[0]], [p2[1], p2[1]], color=color, zorder=1)

def setup_canvas(title):
    fig, ax = plt.subplots(figsize=(12, 8))
    fig.patch.set_facecolor(STYLE['bg'])
    ax.set_facecolor(STYLE['bg'])
    ax.set_title(title, fontsize=16, weight='bold', pad=20, color=STYLE['text'])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    return fig, ax

# --- 1. System Architecture (Azure Style) ---
def gen_architecture():
    fig, ax = setup_canvas("HPC Marketplace System Architecture")
    
    # Groups
    draw_group_box(ax, 0.05, 0.4, 0.25, 0.4, "Client Zone")
    draw_group_box(ax, 0.35, 0.1, 0.3, 0.8, "Blockchain Network (Simulated)")
    draw_group_box(ax, 0.7, 0.2, 0.25, 0.6, "Provider Zone")
    
    # Nodes
    # Client
    draw_icon_node(ax, 0.175, 0.65, "user", "User / Client")
    draw_icon_node(ax, 0.175, 0.5, "web", "Web Dashboard")
    draw_icon_node(ax, 0.175, 0.75, "wallet", "MetaMask Wallet") # Reuse wallet if avail or user
    
    # Blockchain
    draw_icon_node(ax, 0.5, 0.7, "blockchain", "JobMarket Contract", zoom=0.12)
    draw_icon_node(ax, 0.5, 0.5, "smart_contract", "Reputation Contract", zoom=0.12)
    draw_icon_node(ax, 0.5, 0.3, "database", "IPFS Storage", zoom=0.12)
    
    # Provider
    draw_icon_node(ax, 0.825, 0.65, "server", "Provider Node 1")
    draw_icon_node(ax, 0.825, 0.45, "server", "Provider Node 2")
    draw_icon_node(ax, 0.825, 0.3, "docker", "Compute Container")
    
    # Connections
    connect_ortho(ax, (0.175, 0.5), (0.5, 0.7)) # Web -> JobMarket
    connect_ortho(ax, (0.825, 0.65), (0.5, 0.7)) # Provider -> JobMarket
    connect_ortho(ax, (0.825, 0.65), (0.5, 0.3)) # Provider -> IPFS
    connect_ortho(ax, (0.175, 0.5), (0.5, 0.3)) # Web -> IPFS
    
    # Save
    plt.savefig(os.path.join(OUTPUT_DIR, "pro_architecture.png"), dpi=300, bbox_inches='tight')
    plt.close()

# --- 2. Workflow (Linear Process) ---
def gen_workflow():
    fig, ax = setup_canvas("Job Execution Flow")
    
    steps = [
        ("user", "1. Post Job"),
        ("blockchain", "2. Escrow Fund"),
        ("server", "3. Bid & Win"),
        ("docker", "4. Execute"),
        ("code", "5. Verify"),
        ("wallet", "6. Payment")
    ]
    
    x_start = 0.1
    x_gap = 0.15
    y = 0.5
    
    for i, (icon, label) in enumerate(steps):
        x = x_start + i * x_gap
        draw_icon_node(ax, x, y, icon, label, zoom=0.12)
        
        # Arrow to next
        if i < len(steps) - 1:
            next_x = x_start + (i+1) * x_gap
            ax.annotate("", xy=(next_x - 0.05, y), xytext=(x + 0.05, y),
                        arrowprops=dict(arrowstyle="->", color=STYLE['accent'], lw=2))

    plt.savefig(os.path.join(OUTPUT_DIR, "pro_workflow.png"), dpi=300, bbox_inches='tight')
    plt.close()

# --- 3. Topology (Hub & Spoke) ---
def gen_topology():
    fig, ax = setup_canvas("Decentralized Network Topology")
    
    # Central Hub
    draw_icon_node(ax, 0.5, 0.5, "blockchain", "Smart Contract Hub", zoom=0.15)
    
    # Providers
    providers = [
        (0.3, 0.8), (0.7, 0.8), (0.2, 0.5), (0.8, 0.5), (0.3, 0.2), (0.7, 0.2)
    ]
    
    for px, py in providers:
        draw_icon_node(ax, px, py, "server", "Provider Node", zoom=0.08)
        connect(ax, (0.5, 0.5), (px, py), color=STYLE['accent'])
        
    plt.savefig(os.path.join(OUTPUT_DIR, "pro_topology.png"), dpi=300, bbox_inches='tight')
    plt.close()

if __name__ == "__main__":
    gen_architecture()
    gen_workflow()
    gen_topology()
    print("Professional diagrams generated.")
