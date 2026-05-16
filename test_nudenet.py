from nudenet import NudeDetector

detector = NudeDetector()
# Pass the image path
try:
    results = detector.detect('C:\\Users\\Per\\Downloads\\smurf_social-main\\DA_DL_KPDL\\test_input.jpg')
    print("Detection Results:")
    if not results:
        print("No NSFW objects detected.")
    else:
        for result in results:
            print(f"- Class: {result['class']}, Score: {result['score']:.4f}, Box: {result['box']}")
except Exception as e:
    print(f"Error: {e}")
