"""
Constellation Detection Tools
------------------------------
A set of tools for detecting and matching constellations in astronomical images.

Usage:
    from constellation_tools import ConstellationMatcher
    
    # Initialize matcher (no CSV needed - constellation names are built-in!)
    matcher = ConstellationMatcher('path/to/processed_constellations/')
    
    # Get available constellations
    names = matcher.get_constellation_names()
    
    # Match detected objects against constellation patterns
    detected_centroids = [(x1, y1), (x2, y2), ...]  # From star detection
    matches = matcher.find_constellation_matches(detected_centroids)
    
    # Search for a specific constellation
    match = matcher.find_specific_constellation('Orion', detected_centroids)
"""

import cv2
import numpy as np
import pandas as pd
from pathlib import Path
from typing import List, Tuple, Dict, Optional, Union
from scipy.spatial.distance import cdist


# Hardcoded constellation names indexed by image number
CONSTELLATION_NAMES = [
    "Andromeda – Royal Sea Monster Bait",           # image0
    "Antlia – Air Pump",                            # image1
    "Apus – Bird of Paradise",                      # image2
    "Aquarius – Water-Bearer",                      # image3
    "Aquila – Thunderbolt Eagle",                   # image4
    "Ara – Altar",                                  # image5
    "Aries – Ram",                                  # image6
    "Auriga – Charioteer",                          # image7
    "Boötes – Herdsman",                            # image8
    "Caelum – Chisel",                              # image9
    "Camelopardalis – Giraffe",                     # image10
    "Cancer – Crab",                                # image11
    "Canes Venatici – Hunting Dogs",                # image12
    "Canis Major – Big Dog",                        # image13
    "Canis Minor – Small Dog",                      # image14
    "Capricornus – Sea Goat",                       # image15
    "Carina – Keel of Argo Navis",                  # image16
    "Cassiopeia – Vain Queen",                      # image17
    "Centaurus – Centaur",                          # image18
    "Cepheus – King",                               # image19
    "Cetus – Whale",                                # image20
    "Chamaeleon – Chameleon",                       # image21
    "Circinus – Compass",                           # image22
    "Columba – Dove",                               # image23
    "Coma Berenices – Berenice's Hair",             # image24
    "Corona Australis – Southern Crown",            # image25
    "Corona Borealis – Northern Crown",             # image26
    "Corvus – Raven",                               # image27
    "Crater – Cup",                                 # image28
    "Crux – Southern Cross",                        # image29
    "Cygnus – Swan",                                # image30
    "Delphinus – Dolphin",                          # image31
    "Dorado – Fish",                                # image32
    "Draco – Dragon",                               # image33
    "Equuleus – Little Horse",                      # image34
    "Eridanus – River",                             # image35
    "Fornax – Furnace",                             # image36
    "Gemini – Twins",                               # image37
    "Grus – Crane",                                 # image38
    "Hercules – Strong Man",                        # image39
    "Horologium – Pendulum Clock",                  # image40
    "Hydra – Water Serpent",                        # image41
    "Hydrus – Watersnake",                          # image42
    "Indus – Indian",                               # image43
    "Lacerta – Lizard",                             # image44
    "Leo – Lion",                                   # image45
    "Leo Minor – Little Lion",                      # image46
    "Lepus – Hare/Rabbit",                          # image47
    "Libra – Scales",                               # image48
    "Lupus – Wolf",                                 # image49
    "Lynx – Lynx",                                  # image50
    "Lyra – Harp",                                  # image51
    "Mensa – Table Mountain",                       # image52
    "Microscopium – Microscope",                    # image53
    "Monoceros – Unicorn",                          # image54
    "Musca – Fly",                                  # image55
    "Norma – Level",                                # image56
    "Octans – Octant",                              # image57
    "Ophiuchus – Serpent-Bearer",                   # image58
    "Orion – Hunter",                               # image59
    "Pavo – Peacock",                               # image60
    "Pegasus – Winged horse",                       # image61
    "Perseus – Greek Hero",                         # image62
    "Phoenix – Firebird",                           # image63
    "Pictor – Painter's Easel",                     # image64
    "Pisces – Fishes",                              # image65
    "Piscis Austrinus – Southern Fish",             # image66
    "Puppis – Stern of Argo Navis",                 # image67
    "Pyxis – Compass",                              # image68
    "Reticulum – Reticle",                          # image69
    "Sagitta – Arrow",                              # image70
    "Sagittarius – Archer",                         # image71
    "Scorpius – Scorpion",                          # image72
    "Sculptor – Sculptor",                          # image73
    "Scutum – Shield",                              # image74
    "Serpens – Serpent",                            # image75
    "Sextans – Sextant",                            # image76
    "Taurus – Bull",                                # image77
    "Telescopium – Telescope",                      # image78
    "Triangulum – Triangle",                        # image79
    "Triangulum Australe – Southern triangle",      # image80
    "Tucana – Toucan",                              # image81
    "Ursa Major – Big bear",                        # image82
    "Ursa Minor – Small bear",                      # image83
    "Vela – Sails of Argo Navis",                   # image84
    "Virgo – Young Maiden",                         # image85
    "Volans – Flying Fish",                         # image86
    "Vulpecula – Little Fox",                       # image87
]


class ConstellationMatcher:
    """
    A class for loading constellation patterns and matching them against detected objects in images.
    """
    
    def __init__(self, processed_dir: str):
        """
        Initialize the constellation matcher.
        
        Args:
            processed_dir: Path to the directory containing processed constellation images
        """
        self.processed_dir = Path(processed_dir)
        self.constellation_names = CONSTELLATION_NAMES
        self.constellation_centroids = []
        
        self._extract_centroids()
    
    def _find_processed_image(self, image_index: int) -> Optional[str]:
        """Find the processed image path for a given image index."""
        # Try _filtered.png first (new format)
        filtered_path = self.processed_dir / f"image{image_index}_filtered.png"
        if filtered_path.exists():
            return str(filtered_path)
        
        # Fallback to _circles.png (old format)
        circles_path = self.processed_dir / f"image{image_index}_circles.png"
        if circles_path.exists():
            return str(circles_path)
        
        return None
    
    def _extract_circles_centroids(self, image: np.ndarray) -> List[Tuple[int, int]]:
        """
        Extract centroids from circle detection in an image.
        
        Args:
            image: Input image (BGR or grayscale)
            
        Returns:
            List of (x, y) centroid tuples
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        blurred = cv2.GaussianBlur(gray, (9, 9), 2)
        
        circles = cv2.HoughCircles(
            blurred, 
            cv2.HOUGH_GRADIENT, 
            dp=1.2, 
            minDist=30,
            param1=50, 
            param2=30, 
            minRadius=5, 
            maxRadius=30
        )
        
        if circles is not None:
            circles = np.round(circles[0, :]).astype("int")
            centroids = [(int(x), int(y)) for (x, y, r) in circles]
            return centroids
        else:
            return []
    
    def _extract_centroids(self):
        """Extract centroids for all constellations."""
        valid_count = 0
        
        for idx in range(len(self.constellation_names)):
            processed_path = self._find_processed_image(idx)
            
            if processed_path and Path(processed_path).exists():
                img = cv2.imread(processed_path)
                if img is not None:
                    centroids = self._extract_circles_centroids(img)
                    self.constellation_centroids.append(centroids)
                    if len(centroids) > 0:
                        valid_count += 1
                else:
                    self.constellation_centroids.append([])
            else:
                self.constellation_centroids.append([])
        
        print(f"✓ Extracted centroids for {valid_count}/{len(self.constellation_names)} constellations")
    
    def get_constellation_names(self) -> List[str]:
        """
        Get a list of all available constellation names.
        
        Returns:
            List of constellation names
        """
        return self.constellation_names.copy()
    
    def get_constellation_by_name(self, name: str) -> Optional[Dict]:
        """
        Get constellation information by name.
        
        Args:
            name: Constellation name (partial match supported)
            
        Returns:
            Dictionary with constellation info or None if not found
        """
        # Search for partial match (case-insensitive)
        name_lower = name.lower()
        for idx, const_name in enumerate(self.constellation_names):
            if name_lower in const_name.lower():
                return {
                    'index': idx,
                    'name': const_name,
                    'centroids': self.constellation_centroids[idx],
                    'num_stars': len(self.constellation_centroids[idx])
                }
        
        return None
    
    def ransac_match(
        self,
        pattern_centroids: np.ndarray,
        background_centroids: np.ndarray,
        ransac_threshold: float = 50.0,
        min_inliers: int = 3,
        max_iters: int = 1000,
        confidence: float = 0.99,
        rotation_step: int = 15,
        scale_range: Tuple[float, float] = (0.3, 3.0),
        scale_steps: int = 8
    ) -> Optional[Dict]:
        """
        Find the best match between a constellation pattern and background objects using RANSAC
        with explicit scale and rotation exploration.
        
        Args:
            pattern_centroids: Array of (x, y) points representing the constellation pattern
            background_centroids: Array of (x, y) points from detected objects in the image
            ransac_threshold: Maximum distance for a point to be considered an inlier
            min_inliers: Minimum number of inliers required for a valid match
            max_iters: Maximum RANSAC iterations
            confidence: RANSAC confidence level
            rotation_step: Degrees between rotation tests
            scale_range: (min_scale, max_scale) to test
            scale_steps: Number of scale values to test
            
        Returns:
            Dictionary with match information or None if no match found
        """
        pattern_centroids = np.array(pattern_centroids, dtype=np.float32)
        background_centroids = np.array(background_centroids, dtype=np.float32)
        
        if len(pattern_centroids) < 3 or len(background_centroids) < 3:
            return None
        
        best_match = None
        best_inliers = 0
        
        # Generate scales to test
        scales_to_test = np.linspace(scale_range[0], scale_range[1], scale_steps)
        
        # Iterate over different scales
        for scale in scales_to_test:
            scaled_pattern = pattern_centroids * scale
            
            # Iterate over different rotations
            for angle in range(0, 360, rotation_step):
                theta = np.radians(angle)
                rotation_matrix = np.array([
                    [np.cos(theta), -np.sin(theta)],
                    [np.sin(theta),  np.cos(theta)]
                ], dtype=np.float32)
                
                # Rotate the scaled pattern
                transformed_pattern = np.dot(scaled_pattern, rotation_matrix.T).astype(np.float32)
                
                # Find correspondences using nearest neighbor
                distances = cdist(transformed_pattern, background_centroids)
                matches_indices = np.argmin(distances, axis=1)
                matches_distances = np.min(distances, axis=1)
                
                # Filter matches that are too far
                valid_matches = matches_distances < ransac_threshold
                
                if np.sum(valid_matches) < min_inliers:
                    continue
                
                # Create corresponding point pairs
                src_points = transformed_pattern[valid_matches]
                dst_points = background_centroids[matches_indices[valid_matches]]
                
                if len(src_points) < 3:
                    continue
                
                try:
                    # Use RANSAC to refine the transformation
                    model_robust, inliers = cv2.estimateAffinePartial2D(
                        src_points,
                        dst_points,
                        method=cv2.RANSAC,
                        ransacReprojThreshold=ransac_threshold,
                        maxIters=max_iters,
                        confidence=confidence
                    )

                    if model_robust is not None and inliers is not None:
                        num_inliers = np.sum(inliers)
                        if num_inliers > best_inliers and num_inliers >= min_inliers:
                            best_inliers = num_inliers
                            
                            # Extract final scale from transformation matrix
                            # For partial affine: [[a, -b, tx], [b, a, ty]]
                            # Scale = sqrt(a^2 + b^2)
                            a, b = model_robust[0, 0], model_robust[1, 0]
                            final_scale = np.sqrt(a**2 + b**2)
                            
                            best_match = {
                                'rotation_angle': int(angle),
                                'tested_scale': float(scale),
                                'final_scale': float(final_scale),
                                'inliers_ratio': float(num_inliers / len(pattern_centroids)),
                                'inliers_count': int(num_inliers),
                                'transformation_matrix': model_robust.tolist(),
                                'matched_indices': matches_indices[valid_matches][inliers.flatten().astype(bool)].tolist()
                            }
                except cv2.error:
                    continue

        return best_match
    
    def find_constellation_matches(
        self,
        detected_centroids: List[Tuple[float, float]],
        ransac_threshold: float = 50.0,
        min_inliers: int = 3,
        max_iters: int = 1000,
        confidence: float = 0.99,
        rotation_step: int = 30,
        scale_range: Tuple[float, float] = (0.3, 3.0),
        scale_steps: int = 8,
        verbose: bool = True
    ) -> List[Dict]:
        """
        Find all matching constellations in the detected objects.
        
        Args:
            detected_centroids: List of (x, y) coordinates from detected objects
            ransac_threshold: Maximum distance for considering a match
            min_inliers: Minimum number of matching points required
            max_iters: Maximum RANSAC iterations per attempt
            confidence: RANSAC confidence level
            rotation_step: Degrees between rotation tests
            scale_range: (min_scale, max_scale) to test
            scale_steps: Number of scale values to test
            verbose: Print progress information
            
        Returns:
            List of dictionaries containing match information, sorted by inliers_ratio
        """
        matches = []
        detected_centroids = np.array(detected_centroids, dtype=np.float32)
        
        if verbose:
            print(f"Searching for constellations in {len(detected_centroids)} detected objects...")
            print(f"Parameters: threshold={ransac_threshold}, min_inliers={min_inliers}")
        
        for idx, pattern_centroids in enumerate(self.constellation_centroids):
            pattern_centroids = np.array(pattern_centroids, dtype=np.float32)
            
            if len(pattern_centroids) < 3:
                continue
            
            if verbose and (idx + 1) % 10 == 0:
                print(f"  Progress: {idx + 1}/{len(self.constellation_centroids)} constellations checked...")
            
            match = self.ransac_match(
                pattern_centroids,
                detected_centroids,
                ransac_threshold=ransac_threshold,
                min_inliers=min_inliers,
                max_iters=max_iters,
                confidence=confidence,
                rotation_step=rotation_step,
                scale_range=scale_range,
                scale_steps=scale_steps
            )
            
            if match:
                match['constellation_index'] = idx
                match['constellation_name'] = self.constellation_names[idx]
                matches.append(match)
                
                if verbose:
                    print(f"  ✓ Found: {match['constellation_name']} "
                          f"({match['inliers_count']} inliers, {match['inliers_ratio']:.1%})")
        
        # Sort by inliers ratio (best matches first)
        matches.sort(key=lambda x: x['inliers_ratio'], reverse=True)
        
        if verbose:
            print(f"\n{'='*70}")
            print(f"✓ Found {len(matches)} constellation matches")
            print(f"{'='*70}")
        
        return matches
    
    def find_specific_constellation(
        self,
        constellation_name: str,
        detected_centroids: List[Tuple[float, float]],
        ransac_threshold: float = 50.0,
        min_inliers: int = 3,
        max_iters: int = 1000,
        confidence: float = 0.99,
        rotation_step: int = 30,
        scale_range: Tuple[float, float] = (0.3, 3.0),
        scale_steps: int = 8,
        verbose: bool = True
    ) -> Optional[Dict]:
        """
        Search for a specific constellation by name.
        
        Args:
            constellation_name: Name of the constellation to search for (partial match supported)
            detected_centroids: List of (x, y) coordinates from detected objects
            ransac_threshold: Maximum distance for considering a match
            min_inliers: Minimum number of matching points required
            max_iters: Maximum RANSAC iterations
            confidence: RANSAC confidence level
            rotation_step: Degrees between rotation tests
            scale_range: (min_scale, max_scale) to test
            scale_steps: Number of scale values to test
            verbose: Print progress information
            
        Returns:
            Dictionary with match information or None if not found
        """
        constellation_info = self.get_constellation_by_name(constellation_name)
        
        if constellation_info is None:
            if verbose:
                print(f"✗ Constellation '{constellation_name}' not found in catalog")
            return None
        
        if len(constellation_info['centroids']) < 3:
            if verbose:
                print(f"✗ Constellation '{constellation_info['name']}' has insufficient stars")
            return None
        
        if verbose:
            print(f"Searching for '{constellation_info['name']}' "
                  f"({constellation_info['num_stars']} stars)...")
        
        detected_centroids = np.array(detected_centroids, dtype=np.float32)
        pattern_centroids = np.array(constellation_info['centroids'], dtype=np.float32)
        
        match = self.ransac_match(
            pattern_centroids,
            detected_centroids,
            ransac_threshold=ransac_threshold,
            min_inliers=min_inliers,
            max_iters=max_iters,
            confidence=confidence,
            rotation_step=rotation_step,
            scale_range=scale_range,
            scale_steps=scale_steps
        )
        
        if match:
            match['constellation_index'] = constellation_info['index']
            match['constellation_name'] = constellation_info['name']
            
            if verbose:
                print(f"✓ Found '{constellation_info['name']}'!")
                print(f"  Inliers: {match['inliers_count']}/{constellation_info['num_stars']} "
                      f"({match['inliers_ratio']:.1%})")
                print(f"  Rotation: {match['rotation_angle']}°")
                print(f"  Scale: {match['final_scale']:.2f}x")
        else:
            if verbose:
                print(f"✗ Could not find a match for '{constellation_info['name']}'")
        
        return match
    
    def apply_transformation(
        self,
        points: np.ndarray,
        transformation_matrix: Union[np.ndarray, List],
        rotation_angle: float
    ) -> np.ndarray:
        """
        Apply the transformation (rotation + affine) to a set of points.
        
        Args:
            points: Array of (x, y) points
            transformation_matrix: 2x3 affine transformation matrix
            rotation_angle: Initial rotation angle in degrees
            
        Returns:
            Transformed points as numpy array
        """
        points = np.array(points, dtype=np.float32)
        transformation_matrix = np.array(transformation_matrix, dtype=np.float32)
        
        # Apply initial rotation
        theta = np.radians(rotation_angle)
        rotation_matrix = np.array([
            [np.cos(theta), -np.sin(theta)],
            [np.sin(theta),  np.cos(theta)]
        ], dtype=np.float32)
        
        rotated_points = np.dot(points, rotation_matrix.T)
        
        # Apply affine transformation
        ones = np.ones((len(rotated_points), 1))
        homogeneous = np.hstack([rotated_points, ones])
        transformed = homogeneous @ transformation_matrix.T
        
        return transformed
    
    def draw_and_match_constellation(
        self,
        detected_centroids: List[Tuple[float, float]],
        canvas_size: int = 512,
        point_width: int = 25,
        line_width: int = 2,
        ransac_threshold: float = 50.0,
        min_inliers: int = 3,
        max_iters: int = 1000,
        confidence: float = 0.99,
        rotation_step: int = 30,
        scale_range: Tuple[float, float] = (0.3, 3.0),
        scale_steps: int = 8,
        verbose: bool = True
    ) -> Optional[Dict]:
        """
        Launch an interactive drawing interface to draw a constellation pattern,
        then match it against the detected objects.
        
        Args:
            detected_centroids: List of (x, y) coordinates from detected objects in the image
            canvas_size: Size of the drawing canvas (default: 512x512)
            point_width: Radius of points in the drawing (default: 25)
            line_width: Thickness of lines in the drawing (default: 2)
            ransac_threshold: Maximum distance for considering a match
            min_inliers: Minimum number of matching points required
            max_iters: Maximum RANSAC iterations
            confidence: RANSAC confidence level
            rotation_step: Degrees between rotation tests
            scale_range: (min_scale, max_scale) to test
            scale_steps: Number of scale values to test
            verbose: Print progress information
            
        Returns:
            Dictionary with match information including transformation and position, or None if no match
        """
        try:
            # Import the drawing function
            import sys
            from pathlib import Path
            
            # Try to import from tests directory
            tests_dir = Path(__file__).parent.parent / 'tests'
            if str(tests_dir) not in sys.path:
                sys.path.insert(0, str(tests_dir))
            
            from draw_constellation import interactive_draw
            
            if verbose:
                print("\n" + "="*70)
                print("🎨 DRAW YOUR CONSTELLATION")
                print("="*70)
                print("Instructions:")
                print("  1. Click to place star points")
                print("  2. Click on two existing points to draw lines between them")
                print("  3. Press 'D' when done")
                print("  4. Press 'C' to clear and start over")
                print("  5. Press 'ESC' to cancel")
                print("="*70 + "\n")
            
            # Launch interactive drawing
            drawn_centroids = interactive_draw(
                size=canvas_size,
                point_width=point_width,
                line_width=line_width
            )
            
            if not drawn_centroids or len(drawn_centroids) < 3:
                if verbose:
                    print("✗ Insufficient points drawn (need at least 3)")
                return None
            
            if verbose:
                print(f"\n✓ Drew constellation with {len(drawn_centroids)} stars")
                print(f"  Centroids: {drawn_centroids[:5]}{'...' if len(drawn_centroids) > 5 else ''}")
                print("\nSearching for match in detected objects...")
            
            # Convert to numpy arrays
            pattern_centroids = np.array(drawn_centroids, dtype=np.float32)
            detected_centroids_array = np.array(detected_centroids, dtype=np.float32)
            
            # Perform RANSAC matching
            match = self.ransac_match(
                pattern_centroids,
                detected_centroids_array,
                ransac_threshold=ransac_threshold,
                min_inliers=min_inliers,
                max_iters=max_iters,
                confidence=confidence,
                rotation_step=rotation_step,
                scale_range=scale_range,
                scale_steps=scale_steps
            )
            
            if match:
                match['constellation_name'] = 'Custom Drawn Pattern'
                match['pattern_centroids'] = drawn_centroids
                
                if verbose:
                    print(f"\n{'='*70}")
                    print(f"✓ MATCH FOUND!")
                    print(f"{'='*70}")
                    print(f"  Inliers: {match['inliers_count']}/{len(drawn_centroids)} "
                          f"({match['inliers_ratio']:.1%})")
                    print(f"  Rotation: {match['rotation_angle']}°")
                    print(f"  Scale: {match['final_scale']:.2f}x")
                    print(f"  Transformation matrix:")
                    print(f"    {match['transformation_matrix']}")
                    
                    # Calculate approximate position (centroid of matched points)
                    transform_matrix = np.array(match['transformation_matrix'], dtype=np.float32)
                    transformed_center = self.apply_transformation(
                        np.array([[canvas_size/2, canvas_size/2]]),
                        transform_matrix,
                        match['rotation_angle']
                    )[0]
                    print(f"  Approximate position in image: ({transformed_center[0]:.1f}, {transformed_center[1]:.1f})")
                    print(f"{'='*70}\n")
            else:
                if verbose:
                    print(f"\n{'='*70}")
                    print(f"✗ NO MATCH FOUND")
                    print(f"{'='*70}")
                    print(f"  Try adjusting the matching parameters:")
                    print(f"    - Increase ransac_threshold (current: {ransac_threshold})")
                    print(f"    - Decrease min_inliers (current: {min_inliers})")
                    print(f"    - Adjust scale_range (current: {scale_range})")
                    print(f"{'='*70}\n")
            
            return match
            
        except ImportError as e:
            if verbose:
                print(f"✗ Error: Could not import drawing module")
                print(f"  Make sure 'draw_constellation.py' is in the tests directory")
                print(f"  Error details: {e}")
            return None
        except Exception as e:
            if verbose:
                print(f"✗ Error during drawing or matching: {e}")
            return None


# Convenience functions for quick usage
def load_constellation_matcher(
    processed_dir: str = 'tests/processed_constellations/'
) -> ConstellationMatcher:
    """
    Load and initialize a ConstellationMatcher with default paths.
    
    Args:
        processed_dir: Path to processed constellation images directory
        
    Returns:
        Initialized ConstellationMatcher instance
    """
    return ConstellationMatcher(processed_dir)


if __name__ == "__main__":
    # Example usage
    print("Constellation Tools - Example Usage")
    print("=" * 70)
    
    # Initialize matcher (no CSV needed!)
    matcher = ConstellationMatcher(
        processed_dir='../tests/processed_constellations/'
    )
    
    # Get available constellations
    names = matcher.get_constellation_names()
    print(f"\nTotal constellations available: {len(names)}")
    print(f"First 10: {names[:10]}")
    
    # Example: Search for a specific constellation
    print("\n" + "=" * 70)
    print("Example 1: Searching for Orion...")
    
    # Simulated detected centroids (replace with real detection results)
    detected_centroids = [(100, 150), (200, 180), (150, 250), (180, 200), (120, 200), (180, 300)]
    
    match = matcher.find_specific_constellation(
        'Orion',
        detected_centroids,
        ransac_threshold=50.0,
        min_inliers=2,
        verbose=True
    )
    
    if match:
        print(f"\nMatch details:")
        print(f"  Transformation matrix: {match['transformation_matrix']}")
        print(f"  Position: Apply transformation to get final position")
    
    # Example: Draw your own constellation and match it
    print("\n" + "=" * 70)
    print("Example 2: Draw Your Own Constellation")
    print("=" * 70)
    print("Uncomment the code below to try the interactive drawing feature:")
    print("""
    # Launch interactive drawing interface
    custom_match = matcher.draw_and_match_constellation(
        detected_centroids=detected_centroids,
        ransac_threshold=100.0,
        min_inliers=2,
        verbose=True
    )
    
    if custom_match:
        print("Successfully matched your custom constellation!")
    """)
