import cv2
import numpy as np
from scipy import ndimage
import random
from scipy.spatial.distance import euclidean

def process_image(image, gaussian_blur=25, 
                  noise_threshold=120, adaptative_filtering=False, 
                  separation_threshold=3, min_size=20, automated=False, max_components=1000,
                  show_steps=False):
    """
    Process the image to detect stars.
    If automated is True, the noise_threshold will be determined automatically.
    
    separation_threshold is used to determine how much to break up connected components (in pixels).

    min_size is the minimum area for a component to be considered a star.
    
    """
    # First we turn the image into grayscale
    gray_img = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if automated:
        gaussian_blur = min(25, (min(image.shape[0], image.shape[1]) // 10) | 1)

    if show_steps:
        cv2.imshow("Gray", gray_img)
        cv2.waitKey(1)
        
    # Ensure gaussian_blur is odd
    gaussian_blur = (gaussian_blur if gaussian_blur % 2 == 1 else gaussian_blur + 1)

    # Estimate background using a large Gaussian blur
    background = cv2.GaussianBlur(gray_img, (gaussian_blur, gaussian_blur), 0)
    foreground = cv2.subtract(gray_img, background)
    foreground = cv2.subtract(gray_img, foreground)

    if show_steps:
        cv2.imshow("Foreground", foreground)
        cv2.waitKey(1)

    if automated or adaptative_filtering:
        # Apply adaptive thresholding to create a binary mask
        # The reason to use this instead of a fixed threshold is that the brightness can vary across the image
        mask = cv2.adaptiveThreshold(
            foreground,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,  # or cv2.ADAPTIVE_THRESH_MEAN_C
            cv2.THRESH_BINARY,
            blockSize=51,  # must be odd, controls neighborhood size
            C=5            # small constant subtracted, fine-tunes sensitivity
        )

    else:
        _, mask = cv2.threshold(foreground, noise_threshold, 255, cv2.THRESH_BINARY)


    # Substract all originally black pixels to avoid artifacts
    mask[gray_img < noise_threshold] = 0

    if show_steps:
        cv2.imshow("Mask", mask)
        cv2.waitKey(1)

    # Do an erosion before eliminating small components to break up thin connections
    if automated:
        separation_threshold = int(np.sqrt(min_size))
        if separation_threshold < 3:
            separation_threshold = 3

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (separation_threshold, separation_threshold))
    mask = cv2.erode(mask, kernel, iterations=1)

    # Get connected components, eliminate all smaller than min size
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)

    # Let's select the min size depending on the biggest detected component
    if automated:
        min_size = (max(stats[1:, cv2.CC_STAT_AREA])/1000) if n > 1 else 20

    # eliminate small components
    large_mask = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_size:
            large_mask[labels == i] = 255

    if show_steps:
        cv2.imshow("Large Mask", large_mask)
        cv2.waitKey(1)

    # filter all elements in labels that are smaller than min_size
    labels[large_mask == 0] = 0
    # Recalculate stats for large components only
    n, labels, stats, _ = cv2.connectedComponentsWithStats(large_mask)

    # Limit the number of components to max_components by keeping only the largest ones
    if n - 1 > max_components:
        areas = stats[1:, cv2.CC_STAT_AREA]
        largest_indices = np.argsort(areas)[-max_components:] + 1  # +1 to skip background
        new_large_mask = np.zeros_like(large_mask)
        for i in largest_indices:
            new_large_mask[labels == i] = 255
        large_mask = new_large_mask
        labels[large_mask == 0] = 0
        n, labels, stats, _ = cv2.connectedComponentsWithStats(large_mask)

    # Return all useful data
    return large_mask, labels, stats

def extract_properties_fast(image, labels, stats, large_mask):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    num_labels = stats.shape[0]

    indices = np.arange(1, num_labels)

    # Centroid, area directly from stats
    centroids = np.column_stack((stats[indices, cv2.CC_STAT_LEFT] + stats[indices, cv2.CC_STAT_WIDTH] / 2,
                                 stats[indices, cv2.CC_STAT_TOP] + stats[indices, cv2.CC_STAT_HEIGHT] / 2))
    areas = stats[indices, cv2.CC_STAT_AREA]

    # Total brightness (vectorized)
    total_brightness = ndimage.sum(gray, labels, index=indices)

    # Peak brightness (vectorized)
    peak_brightness = ndimage.maximum(gray, labels, index=indices)

    # Color (vectorized)
    mean_colors = []
    for ch in range(3):
        mean_colors.append(ndimage.mean(image[:,:,ch], labels, index=indices))
    mean_colors = np.array(mean_colors).T
    color = np.where(mean_colors[:,2] > mean_colors[:,0], "red", np.where(mean_colors[:,0] > mean_colors[:,2], "blue", "neutral"))

    # Use the ratio between sides of the bounding box to determine stars vs clusters
    stars_vs_clusters = []
    side_ratio = stats[indices, cv2.CC_STAT_WIDTH] / stats[indices, cv2.CC_STAT_HEIGHT]
    for i, idx in enumerate(indices):
        if side_ratio[i] > 1.2:
            stars_vs_clusters.append("cluster")
        else:
            stars_vs_clusters.append("star")

    objects = []
    for i, idx in enumerate(indices):
        objects.append({
            "centroid_x": float(centroids[i,0]),
            "centroid_y": float(centroids[i,1]),
            "area": float(areas[i]),
            "compactness": 1.0,
            "total_brightness": float(total_brightness[i]),
            "peak_brightness": float(peak_brightness[i]),
            "color": color[i],
            "background_contrast": 0.0,  # Placeholder, requires more complex calculation
            "obj_type": stars_vs_clusters[i]
        })
    return objects

def extract_properties(image, labels, stats, large_mask):
    objects = []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    for i in range(1, stats.shape[0]):  # skip background (label 0)
        if np.sum(large_mask[labels == i]) == 0:
            continue

        x, y, w, h, area = stats[i]

        # Component mask
        component_mask = (labels == i).astype(np.uint8)

        # Centroid
        M = cv2.moments(component_mask)
        if M["m00"] != 0:
            cx = M["m10"] / M["m00"]
            cy = M["m01"] / M["m00"]
        else:
            cx, cy = x + w/2, y + h/2

        # Contour for perimeter
        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        perimeter = cv2.arcLength(contours[0], True) if contours else 0
        compactness = (perimeter**2) / (4*np.pi*area) if area > 0 else 0

        # Brightness measures
        pixels = gray[component_mask.astype(bool)]
        total_brightness = np.sum(pixels)
        peak_brightness = np.max(pixels)

        # Color
        pixels_color = image[component_mask.astype(bool)]
        mean_b, mean_g, mean_r = np.mean(pixels_color, axis=0)
        if mean_r > mean_b:
            color = "red"
        elif mean_b > mean_r:
            color = "blue"
        else:
            color = "neutral"

        # Background contrast
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9,9))
        dilated = cv2.dilate(component_mask, kernel, iterations=1)
        border_mask = dilated - component_mask
        obj_mean = np.mean(pixels)
        bg_mean = np.mean(gray[border_mask.astype(bool)]) if np.any(border_mask) else 0
        background_contrast = obj_mean - bg_mean

        # Type heuristic (very simple placeholder)
        if area < 500 and peak_brightness > 200:
            obj_type = "star"
        elif area > 2000:
            obj_type = "galaxy"
        else:
            obj_type = "unknown"

        objects.append({
            "centroid_x": float(cx),
            "centroid_y": float(cy),
            "area": float(area),
            "compactness": float(compactness),
            "total_brightness": float(total_brightness),
            "peak_brightness": float(peak_brightness),
            "color": color,
            "background_contrast": float(background_contrast),
            "obj_type": obj_type
        })

    return objects

def show_boxes(image, stats, indices, color=(0,255,0)):
    output_img = image.copy()
    for i in indices:
        x, y, w, h = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        cv2.rectangle(output_img, (x, y), (x+w, y+h), color, 2)
    cv2.imshow("Output Image", output_img)
    cv2.waitKey(0)

def contextualize_dataset(objects, n_samples=500):
    """
    Given a list of objects (dictionaries with properties), compute contextual statistics:
    - Average, min, max distance between random pairs of objects
    - Number of objects
    - Mean and std of area
    - Mean and std of brightness
    - Distribution of colors
    Returns a dictionary with these statistics.
    As to not overload the computation, we sample up to n_samples pairs of objects to compute distances instead of doing all-vs-all.
    """

    n_objects = len(objects)
    if n_objects < 2:
        return {}

    centroids = np.array([[obj["centroid_x"], obj["centroid_y"]] for obj in objects])

    sampled_distances = []
    for _ in range(min(n_samples, n_objects * (n_objects - 1) // 2)):
        i, j = random.sample(range(n_objects), 2)
        sampled_distances.append(euclidean(centroids[i], centroids[j]))

    areas = np.array([obj["area"] for obj in objects])
    brightness = np.array([obj["total_brightness"] for obj in objects])

    stats = {
        "avg_distance": float(np.mean(sampled_distances)),
        "min_distance": float(np.min(sampled_distances)),
        "max_distance": float(np.max(sampled_distances)),
        "object_count": n_objects,
        "area_mean": float(np.mean(areas)),
        "area_std": float(np.std(areas)),
        "area_min": float(np.min(areas)),
        "area_max": float(np.max(areas)),
        "brightness_mean": float(np.mean(brightness)),
        "brightness_std": float(np.std(brightness)),
        "brightness_min": float(np.min(brightness)),
        "brightness_max": float(np.max(brightness)),
        "color_distribution": {col: sum(obj["color"] == col for obj in objects)/n_objects
                               for col in set(obj["color"] for obj in objects)},
        "type_distribution": {typ: sum(obj["obj_type"] == typ for obj in objects)/n_objects
                               for typ in set(obj["obj_type"] for obj in objects)}
    }

    return stats


if __name__ == "__main__":
    import time

    small_path = "C:\\Natalia\\Trabajo\\Estudios\\5_Inteligencia_Artificial\\NASA_2025\\image.png"

    OG_img = cv2.imread(small_path)

    resize_size = 2000
    if max(OG_img.shape[0], OG_img.shape[1]) > resize_size:
        scale = resize_size / max(OG_img.shape[0], OG_img.shape[1])
        OG_img = cv2.resize(OG_img, (int(OG_img.shape[1]*scale), int(OG_img.shape[0]*scale)), interpolation=cv2.INTER_AREA)


    # Measure the time taken for each section
    times = {}

    start_time = time.time()

    # Process the image to extract large components
    # Large_mask is a binary mask with only the large components
    # Labels is an image where each pixel has the label of its component (0 is background)
    # Stats is an array where each row corresponds to a component and has [x, y, width, height, area]
    large_mask, labels, stats = process_image(OG_img, automated=True)

    process_time = time.time()
    times["Image processing"] = process_time - start_time
    print(f"Image processing completed in {times['Image processing']:.2f} seconds.")

    # Extract properties of the detected objects
    # This function calculates properties like centroid, area, brightness, and color for each object
    objects = extract_properties_fast(OG_img, labels, stats, large_mask)

    # EXTREMELY SLOW ! DO NOT USE UNLESS YOU ARE SURE ABOUT IT
    # objects = extract_properties(OG_img, labels, stats, large_mask)

    extract_time = time.time()
    times["Property extraction"] = extract_time - process_time
    print(f"Property extraction completed in {times['Property extraction']:.2f} seconds.")

    # Print the detected objects
    print(f"Detected {len(objects)} objects:")
    """for i, obj in enumerate(objects):
        print(f"Object {i+1}: {obj}")"""

    # Contextualize the dataset
    # This function computes statistics like average distance, area distribution, and color distribution
    print("Contextualizing dataset...")
    context_stats = contextualize_dataset(objects)

    contextualize_time = time.time()
    times["Dataset contextualization"] = contextualize_time - extract_time
    print(f"Dataset contextualization completed in {times['Dataset contextualization']:.2f} seconds.")

    # Print contextual statistics
    print("Contextual statistics:")
    for k, v in context_stats.items():
        print(f"  {k}: {v}")

    # Print total time taken
    times["Total time"] = contextualize_time - start_time
    print("\nTime breakdown:")
    for section, duration in times.items():
        print(f"  {section}: {duration:.2f} seconds.")

    show_boxes(OG_img, stats, range(1, stats.shape[0]), color=(0,255,0))