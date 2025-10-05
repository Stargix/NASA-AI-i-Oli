import cv2
import numpy as np

def interactive_draw(size=256, point_width=5, line_width=2):
    """
    Opens an interactive drawing window where users can:
    - Click to place white points (automatically draws lines between consecutive points)
    - Press 'Done' button or 'd' key to finish and return the coordinates
    
    Args:
        size: Size of the square canvas (default: 256x256)
        point_width: Radius of points in pixels (default: 3)
        line_width: Thickness of lines in pixels (default: 2)
    
    Returns:
        list: List of (x, y) coordinate tuples representing the points
    """
    # Create black canvas
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    temp_canvas = canvas.copy()
    
    # Store all points
    points = []
    
    def mouse_callback(event, x, y, flags, param):
        nonlocal canvas, temp_canvas
        
        if event == cv2.EVENT_LBUTTONDOWN:
            # Add new point
            points.append((x, y))
            cv2.circle(canvas, (x, y), point_width, (255, 255, 255), -1)
            
            # If this is not the first point, draw line from previous point
            if len(points) > 1:
                prev_point = points[-2]
                cv2.line(canvas, prev_point, (x, y), (255, 255, 255), line_width)
            
            temp_canvas = canvas.copy()
                
        elif event == cv2.EVENT_MOUSEMOVE:
            # Show preview line from last point to cursor
            temp_canvas = canvas.copy()
            
            if len(points) > 0:
                # Draw preview line from last point to cursor
                last_point = points[-1]
                cv2.line(temp_canvas, last_point, (x, y), (128, 128, 128), line_width)
                cv2.circle(temp_canvas, last_point, point_width + 2, (0, 255, 0), 1)
    
    # Create window and set mouse callback
    window_name = 'Interactive Drawing - Press D to Done, C to Clear, ESC to Cancel'
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_callback)
    
    print("🎨 Interactive Drawing Mode")
    print("  - Click to place points (lines auto-connect between consecutive points)")
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
            print("🧹 Canvas cleared")
        elif key == 27:  # ESC key
            # Cancel - return empty canvas
            print("❌ Drawing cancelled")
            canvas = np.zeros((size, size, 3), dtype=np.uint8)
            break
    
    cv2.destroyAllWindows()

    return points


# Example usage
if __name__ == "__main__":
    # Call the interactive drawing function
    coordinates = interactive_draw(size=512, point_width=25, line_width=2)
    
    # Print the coordinates
    print("\n📍 Point Coordinates:")
    for i, (x, y) in enumerate(coordinates, 1):
        print(f"  Point {i}: ({x}, {y})")
    
    print(f"\n✅ Total points: {len(coordinates)}")
    print(f"📋 Coordinates list: {coordinates}")
