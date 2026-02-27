from PIL import Image, ImageDraw, ImageFont
import os

def create_test_image():
    # Create white image
    img = Image.new('RGB', (800, 1000), color='white')
    d = ImageDraw.Draw(img)
    
    # Load default font (might be small, but readable for OCR)
    # If possible, try to load a better font, but default is safest
    try:
        font_header = ImageFont.truetype("arial.ttf", 24)
        font_body = ImageFont.truetype("arial.ttf", 16)
    except IOError:
        font_header = ImageFont.load_default()
        font_body = ImageFont.load_default()

    # Draw text mimicking a discharge summary
    # Header
    d.text((50, 50), "APOLLO HOSPITALS - DISCHARGE SUMMARY", fill='black', font=font_header)
    
    # Patient Info
    d.text((50, 100), "Patient Name: John Doe", fill='black', font=font_body)
    d.text((50, 130), "Age: 45", fill='black', font=font_body)
    d.text((50, 160), "Gender: Male", fill='black', font=font_body)
    d.text((50, 190), "Policy Number: POL-123456789", fill='black', font=font_body)
    
    # Hospital Info
    d.text((50, 240), "Hospital: Apollo Hospitals, Bangalore", fill='black', font=font_body)
    d.text((50, 270), "ROHINI ID: 12345", fill='black', font=font_body)
    
    # Clinical
    d.text((50, 320), "Diagnosis: Acute Appendicitis", fill='black', font=font_body)
    d.text((50, 350), "Procedure: Laparoscopic Appendectomy", fill='black', font=font_body)
    
    # Financial
    d.text((50, 400), "Bill Amount: 75000 INR", fill='black', font=font_body)
    d.text((50, 430), "Admission Date: 2023-10-01", fill='black', font=font_body)
    d.text((50, 460), "Discharge Date: 2023-10-05", fill='black', font=font_body)
    
    # Save
    img.save("test_discharge_summary.png")
    print("Created test_discharge_summary.png")

if __name__ == "__main__":
    create_test_image()
