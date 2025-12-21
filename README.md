# AI i Oli – Embiggen Your Eyes!

AI i Oli is an interactive platform designed to make astronomical image exploration approachable, intuitive, and fun for everyone. By combining large-scale image tiling, classical computer vision, and natural language interaction, AI i Oli allows users to explore massive space images, identify celestial objects, search for patterns, and even discover constellations—without needing advanced technical knowledge.

Live Demo: https://nasa.stargix.dev  
Project Demonstration:  
https://drive.google.com/file/d/1q9fkKrcxjyFnkYLPRctmw-TdsrJDqk9r/view  


Challenge Overview

Modern NASA imagery can contain billions or even trillions of pixels, far exceeding what traditional tools can easily handle. This project addresses the challenge of:

- Navigating massive image datasets smoothly
- Zooming in and out seamlessly
- Labeling known astronomical features
- Discovering new patterns interactively

AI i Oli provides a human-friendly interface to explore space data using natural language and visual tools.


Project Vision

Astronomy tools are often complex, intimidating, and designed for experts. AI i Oli changes that by:

- Allowing anyone to explore space images of any size
- Using natural language chat instead of complex UIs
- Turning image analysis into an engaging and exploratory experience
- Encouraging curiosity, especially among younger and non-technical users


Core Features

Large Image Navigation
- Upload images of virtually any size
- Automatic preprocessing into multi-resolution tiles
- Seamless zooming and panning, even for 200MB+ images

Object Detection (Classical Computer Vision)
- Detects stars, galaxies, and nebulae or clusters
- Implemented using OpenCV
- Includes automatic parameter tuning
- Manual mode available for learning and experimentation
- Bounding boxes update in real time

Feature Database
Each detected object is stored with:
- X and Y position
- Brightness
- Color
- Size
- Distance to other objects

This database enables advanced querying and analysis.


Natural Language Queries
Users can interact with the system using plain language. For example:
"I want to find two red stars close to a blue galaxy"

An AI agent translates these requests into SQL queries over the detected-object database. The agent uses contextual information such as average distances and brightness to interpret terms like "close" or "bright". Matching objects are then highlighted directly on the image.


Similarity Search
Users can:
- Select an interesting region of the image
- Upload a separate reference image
- Ask the system to find visually similar regions

Similarity is computed using four methods:
- Color histogram similarity
- Intensity histogram similarity
- Histogram of Oriented Gradients (HOG)
- A combined similarity metric

Similarity results are displayed visually and stored in the database so the agent can reason over them.


Constellation Detection and Creation
- Search for known constellations within the image
- Draw your own constellation pattern and search for it
- Uses detected stars as features
- Applies a RANSAC-like algorithm to find the best transformation (rotation and scale)
- Determines whether a constellation fits within the image

Constellation data is obtained from a preprocessed constellation database using morphological computer vision techniques.


Website Features

- Image upload for exploring custom high-resolution images
- Detection component with automatic and manual parameter modes
- Similarity tool with adjustable grid size and image uploader
- Constellation component for known or user-drawn patterns
- Chat interface for questions and natural-language image queries

Note: The constellation drawing feature is implemented on the Python server and may generate an error on the public website.


Data and Resources

NASA Data:
- Image of the Andromeda Galaxy

External Data:
- Constellation database


Known Limitations

- The default image on the website is a lower-resolution version of the Andromeda Galaxy for logistical reasons
- Higher-resolution images can be uploaded manually
- If the website fails to fetch data, the Python backend may have reached memory or usage limits


Objective

The goal of AI i Oli is to make space exploration accessible, intuitive, and inspiring. By lowering the technical barrier and emphasizing curiosity-driven discovery, AI i Oli empowers users to explore the universe one zoom at a time.
