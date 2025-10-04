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

    # Safety check: images with only very small stars can end up with a completely black foreground. If all values in foreground are smaller than noise_threshold, we skip the foreground step
    if np.max(foreground) < noise_threshold:
        foreground = gray_img.copy()

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

        # Safety check: is the smallest component area smaller than min_size?
        # Get components:
        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
        if n > 1 and np.min(stats[1:, cv2.CC_STAT_AREA]) < min_size:
            min_size = 1

        separation_threshold = int(np.sqrt(min_size))
        if separation_threshold < 3:
            separation_threshold = 3

    if min_size > 1:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (separation_threshold, separation_threshold))
        mask = cv2.erode(mask, kernel, iterations=1)
    else:
        # Get the initial image and apply a binarization without even blurring
        average_brightness = np.mean(gray_img[gray_img > 0])
        bright_thresh = (average_brightness * 5)
        _, mask = cv2.threshold(gray_img, bright_thresh, 255, cv2.THRESH_BINARY)

    # Get connected components, eliminate all smaller than min size
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)

    # Let's select the min size depending on the biggest detected component
    if automated:
        min_size = (max(stats[1:, cv2.CC_STAT_AREA])/1000) if n > 1 else 1

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

def find_clusters(image, large_mask, labels, stats, 
                  show_steps=False, automated=True,
                  gaussian_blur=101, min_cluster_size=5000):
    """
    Given an image and a mask of stars, find clusters after removing stars from the image.
    """
    image_no_stars = image.copy()
    image_no_stars[large_mask == 255] = 0
    gray_no_stars = cv2.cvtColor(image_no_stars, cv2.COLOR_BGR2GRAY)

    if show_steps:
        cv2.imshow("Image without stars", image_no_stars)
        cv2.waitKey(1)

    # Apply huge Gaussian blur to merge clusters
    if automated:
        gaussian_blur = min(101, (min(image.shape[0], image.shape[1]) // 25) | 1)

    gaussian_blur = (gaussian_blur if gaussian_blur % 2 == 1 else gaussian_blur + 1)
    
    blurred = cv2.GaussianBlur(gray_no_stars, (gaussian_blur, gaussian_blur), 0)

    if show_steps:
        cv2.imshow("Blurred no stars", blurred)
        cv2.waitKey(1)

    # Apply otsu's thresholding to create a binary mask
    _, cluster_mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    if show_steps:
        cv2.imshow("Cluster Mask", cluster_mask)
        cv2.waitKey(1)

    if automated:
        min_cluster_size = (max(stats[1:, cv2.CC_STAT_AREA])/5) if stats.shape[0] > 1 else 5000

    # Remove small clusters
    n_clusters, cluster_labels, cluster_stats, _ = cv2.connectedComponentsWithStats(cluster_mask)
    large_cluster_mask = np.zeros_like(cluster_mask)
    large_cluster_indices = []  # Keep track of which clusters are large enough
    for i in range(1, n_clusters):
        if cluster_stats[i, cv2.CC_STAT_AREA] >= min_cluster_size:
            large_cluster_mask[cluster_labels == i] = 255
            large_cluster_indices.append(i)

    # Recalculate connected components on the filtered mask to get clean labels and stats
    n_large_clusters, large_cluster_labels, large_cluster_stats, _ = cv2.connectedComponentsWithStats(large_cluster_mask)

    if show_steps:
        cv2.imshow("Large Cluster Mask", large_cluster_mask)
        cv2.waitKey(1)

        # Show bounding boxes of clusters - only for large clusters
        temp_cluster_objects = []
        for i in range(1, n_large_clusters):
            temp_cluster_objects.append({
                "bbox_x": int(large_cluster_stats[i, cv2.CC_STAT_LEFT]),
                "bbox_y": int(large_cluster_stats[i, cv2.CC_STAT_TOP]),
                "bbox_width": int(large_cluster_stats[i, cv2.CC_STAT_WIDTH]),
                "bbox_height": int(large_cluster_stats[i, cv2.CC_STAT_HEIGHT]),
                "obj_type": "cluster"
            })
        if temp_cluster_objects:
            show_boxes(image, temp_cluster_objects)
        cv2.waitKey(1)

    return large_cluster_mask, large_cluster_labels, large_cluster_stats

def extract_properties_fast(image, labels, stats, large_mask, cluster=False):
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
    inverse_side_ratio = stats[indices, cv2.CC_STAT_HEIGHT] / stats[indices, cv2.CC_STAT_WIDTH]
    side_ratio = np.maximum(side_ratio, inverse_side_ratio)

    for i, idx in enumerate(indices):
        if cluster:
            stars_vs_clusters.append("cluster")
        elif side_ratio[i] > 1.2:
            stars_vs_clusters.append("galaxy")
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
            "obj_type": stars_vs_clusters[i],
            "bbox_x": int(stats[idx, cv2.CC_STAT_LEFT]),
            "bbox_y": int(stats[idx, cv2.CC_STAT_TOP]),
            "bbox_width": int(stats[idx, cv2.CC_STAT_WIDTH]),
            "bbox_height": int(stats[idx, cv2.CC_STAT_HEIGHT])
        })
    return objects

def show_boxes(image, objects):
    """
    Display bounding boxes on the image based on object properties.
    Color is determined by the object type (cluster=blue, star=green, galaxy=red).
    
    Args:
        image: The image to draw boxes on
        objects: List of object dictionaries containing bounding box (bbox_x, bbox_y, bbox_width, bbox_height) and type information
    """
    output_img = image.copy()
    
    for obj in objects:
        # Get bounding box from object properties
        x = obj.get("bbox_x", 0)
        y = obj.get("bbox_y", 0)
        w = obj.get("bbox_width", 10)
        h = obj.get("bbox_height", 10)
        
        # Determine color based on object type
        obj_type = obj.get("obj_type", "unknown")
        if obj_type == "cluster":
            box_color = (255, 0, 0)  # Blue for clusters
        elif obj_type == "star":
            box_color = (0, 255, 0)  # Green for stars
        elif obj_type == "galaxy":
            box_color = (0, 0, 255)  # Red for galaxies
        else:
            box_color = (255, 255, 255)  # White for unknown types
        
        cv2.rectangle(output_img, (x, y), (x+w, y+h), box_color, 2)
    
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

    small_path = "C:\\Users\\mique\\Downloads\\NASA-AI-i-Oli\\python\\miquel\\test_images\\webb.jpg"

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
    large_mask, labels, stats = process_image(OG_img, automated=True, show_steps=True)

    process_time = time.time()
    times["Image processing"] = process_time - start_time
    print(f"Image processing completed in {times['Image processing']:.2f} seconds.")

    # Find clusters (not used in this example, but could be useful)
    cluster_mask, cluster_labels, cluster_stats = find_clusters(OG_img, large_mask, labels, stats)

    # Extract properties of the detected objects
    # This function calculates properties like centroid, area, brightness, and color for each object
    stars_galaxies = extract_properties_fast(OG_img, labels, stats, large_mask)
    clusters = extract_properties_fast(OG_img, cluster_labels, cluster_stats, cluster_mask, cluster=True)
    objects = stars_galaxies + clusters

    extract_time = time.time()
    times["Property extraction"] = extract_time - process_time
    print(f"Property extraction completed in {times['Property extraction']:.2f} seconds.")

    # Print the detected stars and galaxies
    print(f"Detected {len(stars_galaxies)} stars and galaxies:")
    """for i, obj in enumerate(objects):
        print(f"Object {i+1}: {obj}")"""

    # Contextualize the dataset
    # This function computes statistics like average distance, area distribution, and color distribution
    print("Contextualizing dataset...")
    context_stats = contextualize_dataset(stars_galaxies)

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

    show_boxes(OG_img, objects)