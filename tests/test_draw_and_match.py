"""
Test Draw and Match Constellation
----------------------------------
This script demonstrates the ability to draw your own constellation pattern
and match it against a fabricated set of detected star positions.

The script will:
1. Generate a random set of "detected stars" in an image
2. Launch the interactive drawing interface
3. Match your drawn pattern against the detected stars
4. Visualize the results
"""

import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

# Add parent directory to path to import constellation_tools
parent_dir = Path(__file__).parent.parent / 'python'
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from constellation_tools import ConstellationMatcher


def generate_fake_detected_stars(num_stars=50, image_width=2000, image_height=2000, seed=42):
    """
    Generate a random set of star positions to simulate detected objects.
    
    Args:
        num_stars: Number of stars to generate
        image_width: Width of the simulated image
        image_height: Height of the simulated image
        seed: Random seed for reproducibility
        
    Returns:
        List of (x, y) tuples representing star positions
    """
    np.random.seed(seed)
    
    # Generate random positions
    stars = []
    for _ in range(num_stars):
        x = np.random.uniform(100, image_width - 100)
        y = np.random.uniform(100, image_height - 100)
        stars.append((float(x), float(y)))
    
    return stars


def add_hidden_pattern(detected_stars, pattern_template, position=(1000, 1000), scale=3.0, rotation_deg=45):
    """
    Add a hidden constellation pattern to the detected stars.
    This makes it easier to test matching by ensuring there's a pattern to find.
    
    Args:
        detected_stars: List of existing detected star positions
        pattern_template: List of (x, y) positions for the pattern (in template space)
        position: Center position where to place the pattern in the image
        scale: Scale factor for the pattern
        rotation_deg: Rotation angle in degrees
        
    Returns:
        Updated list of detected stars with the hidden pattern added
    """
    # Convert to numpy array
    pattern = np.array(pattern_template, dtype=np.float32)
    
    # Center the pattern around origin
    pattern_center = np.mean(pattern, axis=0)
    pattern_centered = pattern - pattern_center
    
    # Apply scale
    pattern_scaled = pattern_centered * scale
    
    # Apply rotation
    theta = np.radians(rotation_deg)
    rotation_matrix = np.array([
        [np.cos(theta), -np.sin(theta)],
        [np.sin(theta),  np.cos(theta)]
    ])
    pattern_rotated = np.dot(pattern_scaled, rotation_matrix.T)
    
    # Translate to target position
    pattern_final = pattern_rotated + np.array(position)
    
    # Add to detected stars
    result = detected_stars.copy()
    for point in pattern_final:
        result.append((float(point[0]), float(point[1])))
    
    return result


def visualize_results(detected_stars, match_result, canvas_size=512):
    """
    Visualize the detected stars and the matched pattern.
    
    Args:
        detected_stars: List of detected star positions
        match_result: Match result dictionary from draw_and_match_constellation
        canvas_size: Size of the drawing canvas used
    """
    if match_result is None:
        print("No match to visualize")
        return
    
    # Create figure
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    
    # Left plot: Drawn pattern
    drawn_centroids = match_result['pattern_centroids']
    drawn_array = np.array(drawn_centroids)
    
    axes[0].scatter(drawn_array[:, 0], drawn_array[:, 1], c='yellow', s=200, 
                   edgecolors='orange', linewidths=3, alpha=0.8, label='Drawn Pattern')
    axes[0].set_xlim(0, canvas_size)
    axes[0].set_ylim(0, canvas_size)
    axes[0].invert_yaxis()
    axes[0].set_aspect('equal')
    axes[0].grid(True, alpha=0.3)
    axes[0].set_title(f'Your Drawn Pattern\n({len(drawn_centroids)} stars)', 
                     fontsize=14, fontweight='bold')
    axes[0].set_xlabel('X')
    axes[0].set_ylabel('Y')
    axes[0].legend()
    
    # Right plot: Detected stars with matched pattern overlay
    detected_array = np.array(detected_stars)
    axes[1].scatter(detected_array[:, 0], detected_array[:, 1], 
                   c='cyan', s=50, alpha=0.4, label='Detected Stars')
    
    # Transform the drawn pattern to image coordinates
    transformation_matrix = np.array(match_result['transformation_matrix'], dtype=np.float32)
    rotation_angle = match_result['rotation_angle']
    
    # Apply rotation
    theta = np.radians(rotation_angle)
    rotation_matrix = np.array([
        [np.cos(theta), -np.sin(theta)],
        [np.sin(theta),  np.cos(theta)]
    ], dtype=np.float32)
    
    rotated_pattern = np.dot(drawn_array, rotation_matrix.T)
    
    # Apply affine transformation
    ones = np.ones((len(rotated_pattern), 1))
    homogeneous = np.hstack([rotated_pattern, ones])
    transformed_pattern = homogeneous @ transformation_matrix.T
    
    # Plot transformed pattern
    axes[1].scatter(transformed_pattern[:, 0], transformed_pattern[:, 1], 
                   c='red', s=200, edgecolors='yellow', linewidths=3, 
                   alpha=0.9, label='Matched Pattern', zorder=5)
    
    # Draw lines between matched pattern points
    for i in range(len(transformed_pattern) - 1):
        axes[1].plot([transformed_pattern[i, 0], transformed_pattern[i+1, 0]],
                    [transformed_pattern[i, 1], transformed_pattern[i+1, 1]],
                    'yellow', linewidth=2, alpha=0.6, zorder=4)
    
    # Add numbers to the points
    for i, point in enumerate(transformed_pattern):
        axes[1].text(point[0], point[1], str(i), 
                    color='white', fontsize=10, ha='center', va='center',
                    fontweight='bold', zorder=6,
                    bbox=dict(boxstyle='circle', facecolor='red', alpha=0.7))
    
    # Calculate center of matched pattern for better zoom
    pattern_center = np.mean(transformed_pattern, axis=0)
    pattern_extent = np.max(np.ptp(transformed_pattern, axis=0))
    
    # Set zoom to focus on the matched pattern with some context
    zoom_margin = max(pattern_extent * 2, 400)  # Show at least 400px around pattern
    axes[1].set_xlim(pattern_center[0] - zoom_margin, pattern_center[0] + zoom_margin)
    axes[1].set_ylim(pattern_center[1] - zoom_margin, pattern_center[1] + zoom_margin)
    
    axes[1].set_aspect('equal')
    axes[1].grid(True, alpha=0.3)
    axes[1].set_title(f'Match Found!\n'
                     f'Inliers: {match_result["inliers_count"]}/{len(drawn_centroids)} '
                     f'({match_result["inliers_ratio"]:.1%})\n'
                     f'Rotation: {match_result["rotation_angle"]}° | '
                     f'Scale: {match_result["final_scale"]:.2f}x\n'
                     f'Pattern Center: ({pattern_center[0]:.0f}, {pattern_center[1]:.0f})',
                     fontsize=14, fontweight='bold')
    axes[1].set_xlabel('X (pixels)')
    axes[1].set_ylabel('Y (pixels)')
    axes[1].legend(loc='upper right')
    
    plt.tight_layout()
    plt.show()
    
    print("\n" + "="*70)
    print("VISUALIZATION COMPLETE")
    print(f"Pattern found at: ({pattern_center[0]:.1f}, {pattern_center[1]:.1f})")
    print("="*70)


def main():
    """Main test function."""
    print("="*70)
    print("TEST: DRAW AND MATCH YOUR OWN CONSTELLATION")
    print("="*70)
    print()
    
    # Configuration
    NUM_RANDOM_STARS = 100
    IMAGE_WIDTH = 2000
    IMAGE_HEIGHT = 2000
    ADD_HIDDEN_PATTERN = True  # Set to True to make matching easier for testing
    
    # Generate fake detected stars
    print("📍 Generating fabricated detected stars...")
    detected_stars = generate_fake_detected_stars(
        num_stars=NUM_RANDOM_STARS,
        image_width=IMAGE_WIDTH,
        image_height=IMAGE_HEIGHT,
        seed=42
    )
    print(f"   ✓ Generated {len(detected_stars)} random star positions")
    
    # Optionally add a hidden pattern (makes testing easier)
    if ADD_HIDDEN_PATTERN:
        print("\n🎯 Adding a hidden pattern for testing...")
        print("   Tip: Try drawing a triangle - points at roughly (100,100), (50,200), (150,200)")
        
        # Simple triangle pattern in template space
        triangle_pattern = [
            (100, 100),  # Top
            (50, 200),   # Bottom left
            (150, 200),  # Bottom right
        ]
        
        detected_stars = add_hidden_pattern(
            detected_stars,
            pattern_template=triangle_pattern,
            position=(1000, 1000),
            scale=5.0,  # Larger scale to make it more distinctive
            rotation_deg=25
        )
        print(f"   ✓ Hidden triangle pattern added at position (1000, 1000)")
        print(f"   ✓ Scale: 5.0x | Rotation: 25°")
        print(f"   ✓ Total stars now: {len(detected_stars)}")
    
    # Initialize matcher (without needing constellation database)
    print("\n🔧 Initializing constellation matcher...")
    # Note: We pass a dummy path since we won't be using the constellation database
    try:
        matcher = ConstellationMatcher(processed_dir='../tests/processed_constellations/')
    except:
        # If path doesn't exist, that's okay - we're not using it
        print("   ⚠ Constellation database not found, but that's OK for this test")
        matcher = None
    
    if matcher is None:
        # Create a minimal matcher just for the draw function
        class MinimalMatcher:
            def ransac_match(self, *args, **kwargs):
                # Import here to avoid circular dependency
                from constellation_tools import ConstellationMatcher
                temp_matcher = ConstellationMatcher.__new__(ConstellationMatcher)
                return temp_matcher.ransac_match(*args, **kwargs)
            
            def apply_transformation(self, *args, **kwargs):
                from constellation_tools import ConstellationMatcher
                temp_matcher = ConstellationMatcher.__new__(ConstellationMatcher)
                return temp_matcher.apply_transformation(*args, **kwargs)
        
        matcher = MinimalMatcher()
    
    # Launch drawing interface and perform matching
    print("\n" + "="*70)
    print("🎨 LAUNCHING DRAWING INTERFACE...")
    print("="*70)
    
    match_result = matcher.draw_and_match_constellation(
        detected_centroids=detected_stars,
        canvas_size=512,
        point_width=25,
        line_width=2,
        ransac_threshold=100.0,  # Generous threshold for testing
        min_inliers=3,           # Need at least 3 points to match
        max_iters=1000,
        rotation_step=15,        # Test every 15 degrees
        scale_range=(0.5, 8.0),  # Wide range of scales
        scale_steps=10,
        verbose=True
    )
    
    # Visualize results if match found
    if match_result:
        print("\n📊 Creating visualization...")
        visualize_results(detected_stars, match_result, canvas_size=512)
    else:
        print("\n❌ No match found. Try:")
        print("   - Drawing a simpler pattern")
        print("   - Increasing ransac_threshold")
        print("   - Decreasing min_inliers")
    
    print("\n" + "="*70)
    print("TEST COMPLETE")
    print("="*70)


if __name__ == "__main__":
    main()
