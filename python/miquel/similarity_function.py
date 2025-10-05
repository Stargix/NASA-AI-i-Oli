import cv2
import numpy as np
from skimage.feature import hog
from skimage import color

def compare_images_grid(img1, img2, grid_size=10, hist_bins=32, method=cv2.HISTCMP_CORREL, method_type="color", automatic_grid_size=False):
    """
    Compare two images by subdividing img1 into grid_size×grid_size zones,
    computing a descriptor for each zone, comparing it to img2 descriptor,
    and returning a grid of similarity scores.

    Args:
        img1 (np.array): First image (to be subdivided).
        img2 (np.array): Second image (reference).
        grid_size (int): Number of cells along width and height (default 10).
        hist_bins (int): Number of bins for histogram (default 32).
        method (int): OpenCV histogram comparison method (only for color/brightness).
        method_type (str): "color", "brightness", or "hog".

    Returns:
        scores (list of lists): grid_size×grid_size matrix of similarity scores.
    """
    scores = []
    h1, w1 = img1.shape[:2]

    if automatic_grid_size:
        # Make grid size depend on the height and width of the original image relative to the second one
        h2, w2 = img2.shape[:2]
        ratio_h = h1 / h2
        ratio_w = w1 / w2
        avg_ratio = (ratio_h + ratio_w) / 2
        grid_size = max(5, min(100, int(avg_ratio * 10)))

    cell_h = h1 // grid_size
    cell_w = w1 // grid_size

    # Prepare reference descriptor from img2
    if method_type == "color":
        hist2 = cv2.calcHist([img2], [0, 1, 2], None, [hist_bins]*3, [0, 256]*3)
        cv2.normalize(hist2, hist2)

    elif method_type == "brightness":
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        hist2 = cv2.calcHist([gray2], [0], None, [hist_bins], [0, 256])
        cv2.normalize(hist2, hist2)

    elif method_type == "hog":
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        # Resize img2 to match cell dimensions for consistent HOG feature dimensions
        gray2_resized = cv2.resize(gray2, (cell_w, cell_h), interpolation=cv2.INTER_AREA)
        hist2, _ = hog(gray2_resized, pixels_per_cell=(cell_h, cell_w), cells_per_block=(1, 1), visualize=True, feature_vector=True)

    else:
        raise ValueError(f"Unknown method_type: {method_type}")

    for i in range(grid_size):
        row_scores = []
        for j in range(grid_size):
            cell = img1[i*cell_h:(i+1)*cell_h, j*cell_w:(j+1)*cell_w]

            if method_type == "color":
                hist_cell = cv2.calcHist([cell], [0, 1, 2], None, [hist_bins]*3, [0, 256]*3)
                cv2.normalize(hist_cell, hist_cell)
                score = cv2.compareHist(hist_cell, hist2, method)

            elif method_type == "brightness":
                gray_cell = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
                hist_cell = cv2.calcHist([gray_cell], [0], None, [hist_bins], [0, 256])
                cv2.normalize(hist_cell, hist_cell)
                score = cv2.compareHist(hist_cell, hist2, method)

            elif method_type == "hog":
                gray_cell = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
                hist_cell, _ = hog(gray_cell, pixels_per_cell=(cell_h, cell_w), cells_per_block=(1, 1), visualize=True, feature_vector=True)
                score = -np.linalg.norm(hist_cell - hist2)  # lower distance = higher score
                # Change from np.float to native float for JSON serialization if needed
                score = float(score)

            row_scores.append(score)
        scores.append(row_scores)

    # Normalize scores to 0–1 range
    min_score = min(min(row) for row in scores)
    max_score = max(max(row) for row in scores)
    for i in range(grid_size):
        for j in range(grid_size):
            scores[i][j] = (scores[i][j] - min_score) / (max_score - min_score) if max_score > min_score else 0
            scores[i][j] = round(scores[i][j], 4)

    return scores


def average_scores(scores1, scores2, scores3):
    """
    Average three similarity score grids to combine different comparison methods.
    
    Args:
        scores1 (list of lists): First grid of similarity scores.
        scores2 (list of lists): Second grid of similarity scores.
        scores3 (list of lists): Third grid of similarity scores.
    
    Returns:
        list of lists: Averaged grid of similarity scores.
    """
    grid_size = len(scores1)
    averaged_scores = []
    
    for i in range(grid_size):
        row = []
        for j in range(grid_size):
            avg = (scores1[i][j] + scores2[i][j] + scores3[i][j]) / 3.0
            row.append(round(avg, 4))
        averaged_scores.append(row)
    
    return averaged_scores


def visualize_scores(scores, title="Similarity Heatmap", cell_size=50):
    """
    Visualize similarity scores as a colored heatmap.
    
    Args:
        scores (list of lists): grid_size×grid_size matrix of similarity scores (0-1 range).
        title (str): Title for the visualization window.
        cell_size (int): Size of each cell in pixels (default 50).
    
    Returns:
        np.array: The heatmap image.
    """
    grid_size = len(scores)
    heatmap = np.zeros((grid_size * cell_size, grid_size * cell_size, 3), dtype=np.uint8)
    
    for i in range(grid_size):
        for j in range(grid_size):
            score = scores[i][j]
            # Convert score (0-1) to color using a colormap
            # 0 = blue (cold/low similarity), 1 = red (hot/high similarity)
            color_value = int(score * 255)
            
            # Create a color gradient from blue to green to red
            if score < 0.5:
                # Blue to green
                b = int(255 * (1 - score * 2))
                g = int(255 * score * 2)
                r = 0
            else:
                # Green to red
                b = 0
                g = int(255 * (1 - (score - 0.5) * 2))
                r = int(255 * (score - 0.5) * 2)
            
            # Fill the cell with the color
            y1, y2 = i * cell_size, (i + 1) * cell_size
            x1, x2 = j * cell_size, (j + 1) * cell_size
            heatmap[y1:y2, x1:x2] = (b, g, r)
            
            # Add text with the score value
            text = f"{score:.2f}"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.4
            thickness = 1
            text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
            text_x = x1 + (cell_size - text_size[0]) // 2
            text_y = y1 + (cell_size + text_size[1]) // 2
            cv2.putText(heatmap, text, (text_x, text_y), font, font_scale, (255, 255, 255), thickness)
    
    cv2.imshow(title, heatmap)
    return heatmap


if __name__ == "__main__":
    import time
    import os
    start_time = time.time()
    
    # Obtener la ruta base del proyecto
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "..", "..")
    frontend_public = os.path.join(project_root, "frontend", "public")
    
    small_path = os.path.join(frontend_public, "andromeda.jpg")
    small_path2 = os.path.join(frontend_public, "andro_pattern.jpg")
    
    # Verificar que los archivos existen
    if not os.path.exists(small_path):
        print(f"❌ Error: No se encuentra la imagen: {small_path}")
        print(f"   Ruta absoluta: {os.path.abspath(small_path)}")
        exit(1)
    
    if not os.path.exists(small_path2):
        print(f"❌ Error: No se encuentra la imagen: {small_path2}")
        print(f"   Ruta absoluta: {os.path.abspath(small_path2)}")
        exit(1)
    
    print(f"✅ Cargando imagen 1: {small_path}")
    print(f"✅ Cargando imagen 2: {small_path2}")

    resize_size = 2000

    OG_img1 = cv2.imread(small_path)
    OG_img2 = cv2.imread(small_path2)
    
    if OG_img1 is None:
        print(f"❌ Error: No se pudo cargar la imagen 1: {small_path}")
        exit(1)
    
    if OG_img2 is None:
        print(f"❌ Error: No se pudo cargar la imagen 2: {small_path2}")
        exit(1)

    if max(OG_img1.shape[0], OG_img1.shape[1]) > resize_size:
        scale = resize_size / max(OG_img1.shape[0], OG_img1.shape[1])
        OG_img1 = cv2.resize(OG_img1, (int(OG_img1.shape[1]*scale), int(OG_img1.shape[0]*scale)), interpolation=cv2.INTER_AREA)

    if max(OG_img2.shape[0], OG_img2.shape[1]) > resize_size:
        scale = resize_size / max(OG_img2.shape[0], OG_img2.shape[1])
        OG_img2 = cv2.resize(OG_img2, (int(OG_img2.shape[1]*scale), int(OG_img2.shape[0]*scale)), interpolation=cv2.INTER_AREA)

    grid_scores_color = compare_images_grid(OG_img1, OG_img2, grid_size=10, method_type="color", automatic_grid_size=True)
    grid_scores_brightness = compare_images_grid(OG_img1, OG_img2, grid_size=10, method_type="brightness", automatic_grid_size=True)
    grid_scores_hog = compare_images_grid(OG_img1, OG_img2, grid_size=10, method_type="hog", automatic_grid_size=True)

    print("Grid similarity scores:")
    print("Color-based:")
    for row in grid_scores_color:
        print(row)
    print("Brightness-based:")
    for row in grid_scores_brightness:
        print(row)  
    print("HOG-based:")
    for row in grid_scores_hog:
        print(row)

    # Combine the three methods by averaging
    grid_scores_averaged = average_scores(grid_scores_color, grid_scores_brightness, grid_scores_hog)
    print("Averaged (Combined Methods):")
    for row in grid_scores_averaged:
        print(row)

    # Visualize the similarity scores as heatmaps
    print("\nGenerating visualizations...")
    visualize_scores(grid_scores_color, title="Color-based Similarity", cell_size=50)
    visualize_scores(grid_scores_brightness, title="Brightness-based Similarity", cell_size=50)
    visualize_scores(grid_scores_hog, title="HOG-based Similarity", cell_size=50)
    visualize_scores(grid_scores_averaged, title="Averaged (Combined Methods)", cell_size=50)
    
    print("Press any key on the visualization windows to close them...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    processing_time = time.time() - start_time
    print(f"Processing time: {processing_time:.2f} seconds")
