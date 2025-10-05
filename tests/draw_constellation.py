import cv2
import numpy as np

def interactive_draw(size=256, point_width=5, line_width=2):
    """
    Opens an interactive drawing window where users can:
    - Click to place white points
    - Click on one point and then another to draw a straight line between them
    - Press 'Done' button or 'd' key to finish and return the coordinates
    
    Args:
        size: Size of the square canvas (default: 256x256)
        point_width: Radius of points in pixels (default: 3)
        line_width: Thickness of lines in pixels (default: 2)
    
    Returns:
        tuple: (points, canvas) where:
            - points: List of (x, y) coordinate tuples representing the points
            - canvas: The drawn image as a numpy array
    """
    # Create black canvas
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    temp_canvas = canvas.copy()
    
    # Store all points
    points = []
    
    # Line drawing state
    selected_point = None
    
    def find_nearest_point(x, y, max_distance=15):
        """Find the nearest point within max_distance"""
        min_dist = float('inf')
        nearest = None
        nearest_idx = None
        
        for idx, point in enumerate(points):
            dist = np.sqrt((point[0] - x)**2 + (point[1] - y)**2)
            if dist < min_dist and dist <= max_distance:
                min_dist = dist
                nearest = point
                nearest_idx = idx
        
        return nearest, nearest_idx
    
    def mouse_callback(event, x, y, flags, param):
        nonlocal selected_point, canvas, temp_canvas
        
        if event == cv2.EVENT_LBUTTONDOWN:
            # Check if clicking near an existing point
            nearest, idx = find_nearest_point(x, y)
            
            if nearest is not None:
                # Clicked on an existing point
                if selected_point is None:
                    # First point selected - start line drawing
                    selected_point = nearest
                    temp_canvas = canvas.copy()
                    cv2.circle(temp_canvas, selected_point, point_width + 2, (0, 255, 0), 2)
                else:
                    # Second point selected - draw line between points
                    cv2.line(canvas, selected_point, nearest, (255, 255, 255), line_width)
                    selected_point = None
                    temp_canvas = canvas.copy()
            else:
                # Clicked on empty space - create new point
                points.append((x, y))
                cv2.circle(canvas, (x, y), point_width, (255, 255, 255), -1)
                temp_canvas = canvas.copy()
                selected_point = None
                
        elif event == cv2.EVENT_MOUSEMOVE:
            # Show preview line if a point is selected
            temp_canvas = canvas.copy()
            
            if selected_point is not None:
                # Draw preview line to cursor
                cv2.line(temp_canvas, selected_point, (x, y), (128, 128, 128), line_width)
                cv2.circle(temp_canvas, selected_point, point_width + 2, (0, 255, 0), 2)
            
            # Highlight point under cursor
            nearest, _ = find_nearest_point(x, y)
            if nearest is not None:
                cv2.circle(temp_canvas, nearest, point_width + 2, (0, 255, 255), 1)
    
    # Create window and set mouse callback
    window_name = 'Interactive Drawing - Press D to Done, C to Clear, ESC to Cancel'
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_callback)
    
    print("🎨 Interactive Drawing Mode")
    print("  - Click to place a point")
    print("  - Click two existing points to draw a line between them")
    print("  - Press 'D' when done")
    print("  - Press 'C' to clear canvas")
    print("  - Press 'ESC' to cancel")
    
    while True:
        # Display canvas with temporary overlays
        cv2.imshow(window_name, temp_canvas)
        
        # Wait for key press
        key = cv2.waitKey(1) & 0xFF
        
        if key == ord('d') or key == ord('D'):
            # Done - return the canvas
            print("✅ Drawing complete!")
            break
        elif key == ord('c') or key == ord('C'):
            # Clear canvas
            canvas = np.zeros((size, size, 3), dtype=np.uint8)
            temp_canvas = canvas.copy()
            points.clear()
            selected_point = None
            print("🧹 Canvas cleared")
        elif key == 27:  # ESC key
            # Cancel - return empty canvas
            print("❌ Drawing cancelled")
            canvas = np.zeros((size, size, 3), dtype=np.uint8)
            break
    
    cv2.destroyAllWindows()

    return points, canvas


# Example usage
if __name__ == "__main__":
    # Call the interactive drawing function
    coordinates, canvas = interactive_draw(size=512, point_width=25, line_width=2)
    
    # Print the coordinates
    print("\n📍 Point Coordinates:")
    for i, (x, y) in enumerate(coordinates, 1):
        print(f"  Point {i}: ({x}, {y})")
    
    print(f"\n✅ Total points: {len(coordinates)}")
    print(f"📋 Coordinates list: {coordinates}")
    
    # Save the drawn image if points were drawn
    if len(coordinates) > 0:
        cv2.imwrite('custom_constellation.png', canvas)
        print("💾 Saved drawn constellation to 'custom_constellation.png'")
