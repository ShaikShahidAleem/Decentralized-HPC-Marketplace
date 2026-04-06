import matplotlib.pyplot as plt
import matplotlib.patches as patches
import networkx as nx
import numpy as np
import os

# Create output directory
OUTPUT_DIR = r"c:\Capstone Project\presentation_visuals"
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# --- Style Settings ---
plt.style.use('dark_background')
COLORS = {
    'bg': '#0f0f15',
    'accent1': '#6366f1', # Indigo
    'accent2': '#8b5cf6', # Violet
    'accent3': '#ec4899', # Pink
    'text': '#f3f4f6',
    'grid': '#374151'
}

def setup_plot(title):
    fig, ax = plt.subplots(figsize=(10, 6))
    fig.patch.set_facecolor(COLORS['bg'])
    ax.set_facecolor(COLORS['bg'])
    ax.set_title(title, color=COLORS['text'], fontsize=16, pad=20, weight='bold')
    return fig, ax

def save_plot(fig, filename):
    path = os.path.join(OUTPUT_DIR, filename)
    plt.savefig(path, dpi=300, bbox_inches='tight', facecolor=COLORS['bg'])
    plt.close(fig)
    print(f"Generated {path}")

# --- 1. Network Topology (Slides 1, 2, 5) ---
def generate_topology():
    fig, ax = setup_plot("Decentralized Network Topology")
    
    G = nx.scale_free_graph(15)
    G = nx.Graph(G) # Convert to undirected
    pos = nx.spring_layout(G, seed=42)
    
    # Draw nodes
    nx.draw_networkx_nodes(G, pos, node_size=300, node_color=COLORS['accent1'], alpha=0.8, ax=ax)
    # Draw edges
    nx.draw_networkx_edges(G, pos, edge_color=COLORS['grid'], alpha=0.5, ax=ax)
    
    # Highlight hubs
    hubs = [n for n, d in G.degree() if d > 3]
    nx.draw_networkx_nodes(G, pos, nodelist=hubs, node_size=600, node_color=COLORS['accent3'], ax=ax)
    
    ax.axis('off')
    save_plot(fig, "topology.png")

# --- 2. Cost Comparison (Slides 3, 17) ---
def generate_comparison():
    fig, ax = setup_plot("Cost Efficiency Analysis")
    
    categories = ['Compute Cost', 'Data Transfer', 'Maintenance', 'Margins']
    centralized = [100, 80, 60, 120]
    decentralized = [40, 30, 20, 10]
    
    x = np.arange(len(categories))
    width = 0.35
    
    rects1 = ax.bar(x - width/2, centralized, width, label='Cloud Provider', color=COLORS['accent2'])
    rects2 = ax.bar(x + width/2, decentralized, width, label='HPC Marketplace', color=COLORS['accent3'])
    
    ax.set_ylabel('Relative Cost Index', color=COLORS['text'])
    ax.set_xticks(x)
    ax.set_xticklabels(categories, color=COLORS['text'])
    ax.legend(facecolor=COLORS['bg'], labelcolor=COLORS['text'])
    
    ax.spines['bottom'].set_color(COLORS['grid'])
    ax.spines['left'].set_color(COLORS['grid'])
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.tick_params(axis='x', colors=COLORS['text'])
    ax.tick_params(axis='y', colors=COLORS['text'])
    
    save_plot(fig, "cost_comparison.png")

# --- 3. Architecture Layers (Slides 6, 7) ---
def generate_architecture():
    fig, ax = setup_plot("System Architecture Layers")
    
    layers = [
        ("Client Layer", COLORS['accent1'], ["Web UI", "Wallet", "Dashboard"]),
        ("Blockchain Layer", COLORS['accent2'], ["JobMarket", "Reputation", "Escrow"]),
        ("Provider Layer", COLORS['accent3'], ["Compute Node", "Listener", "Executor"]),
        ("Storage Layer", "#10b981", ["IPFS", "Data Sharding", "Retrieval"])
    ]
    
    y_pos = 0.8
    height = 0.15
    width = 0.6
    x_pos = 0.2
    
    for name, color, components in layers:
        # Draw Layer Box
        rect = patches.FancyBboxPatch((x_pos, y_pos), width, height, 
                                     boxstyle="round,pad=0.05", 
                                     linewidth=2, edgecolor=color, facecolor=color, alpha=0.3)
        ax.add_patch(rect)
        
        # Label
        ax.text(x_pos + width/2, y_pos + height/2 + 0.02, name, 
                ha='center', va='center', fontsize=12, fontweight='bold', color='white')
        
        # Components
        comp_text = " | ".join(components)
        ax.text(x_pos + width/2, y_pos + height/2 - 0.04, comp_text, 
                ha='center', va='center', fontsize=9, color='#e5e7eb')
        
        # Draw arrow to next layer
        if y_pos > 0.3:
            ax.arrow(x_pos + width/2, y_pos, 0, -0.05, 
                     head_width=0.02, head_length=0.02, fc=COLORS['grid'], ec=COLORS['grid'])
        
        y_pos -= 0.25
    
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.1)
    ax.axis('off')
    save_plot(fig, "architecture.png")

# --- 4. Workflow Sequence (Slides 8, 12) ---
def generate_workflow():
    fig, ax = setup_plot("Job Execution Workflow")
    
    # Swimlines
    actors = ["Client", "Smart Contract", "Provider", "Storage"]
    x_positions = [0.15, 0.4, 0.65, 0.9]
    
    # Draw vertical lines
    for x in x_positions:
        ax.plot([x, x], [0.1, 0.9], color=COLORS['grid'], linestyle='--')
    
    # Draw actors
    for x, actor in zip(x_positions, actors):
        ax.text(x, 0.95, actor, ha='center', fontsize=12, weight='bold', color=COLORS['accent1'])
    
    # Steps
    steps = [
        (0, 1, "1. Post Job + Deposit", 0.85),
        (1, 1, "2. Event Emitted", 0.75),
        (2, 1, "3. Submit Bid", 0.65),
        (0, 1, "4. Select Provider", 0.55),
        (2, 3, "5. Fetch Data", 0.45),
        (2, 2, "6. Execute Compute", 0.35),
        (2, 1, "7. Submit Result", 0.25),
        (0, 1, "8. Confirm & Pay", 0.15)
    ]
    
    for start_idx, end_idx, label, y in steps:
        start_x = x_positions[start_idx]
        end_x = x_positions[end_idx]
        
        color = COLORS['accent2'] if start_idx < end_idx else COLORS['accent3']
        
        ax.annotate("", xy=(end_x, y), xytext=(start_x, y),
                    arrowprops=dict(arrowstyle="->", color=color, lw=2))
        ax.text((start_x + end_x)/2, y + 0.02, label, ha='center', fontsize=9, color='white')

    ax.set_ylim(0, 1)
    ax.axis('off')
    save_plot(fig, "workflow.png")

# --- 5. Tech Stack (Slide 13) ---
def generate_tech_stack():
    fig, ax = setup_plot("Tech Stack Distribution")
    
    labels = ['Solidity (Smart Contracts)', 'JavaScript (Client)', 'Node.js (Provider)', 'Docker (Infra)']
    sizes = [35, 30, 20, 15]
    colors = [COLORS['accent1'], COLORS['accent2'], COLORS['accent3'], '#10b981']
    explode = (0.1, 0, 0, 0)
    
    ax.pie(sizes, explode=explode, labels=labels, colors=colors, autopct='%1.1f%%',
           shadow=True, startangle=140, textprops={'color': "white"})
    
    save_plot(fig, "tech_stack.png")

if __name__ == "__main__":
    print("Generating diagrams...")
    generate_topology()
    generate_comparison()
    generate_architecture()
    generate_workflow()
    generate_tech_stack()
    print("All diagrams generated successfully.")
