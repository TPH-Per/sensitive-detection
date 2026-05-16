import urllib.request
from nudenet import NudeDetector

urls = {
    "David Statue": "https://upload.wikimedia.org/wikipedia/commons/d/d5/David_von_Michelangelo.jpg",
    "Woman in Bikini": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Woman_in_bikini.jpg/400px-Woman_in_bikini.jpg",
    "Mona Lisa Face": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/400px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg"
}

detector = NudeDetector()
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
urllib.request.install_opener(opener)

for name, url in urls.items():
    print(f"\n--- Testing: {name} ---")
    filename = f"{name.replace(' ', '_')}.jpg"
    try:
        urllib.request.urlretrieve(url, filename)
        results = detector.detect(filename)
        if not results:
            print("No NSFW objects detected.")
        else:
            for result in results:
                print(f"- Class: {result['class']}, Score: {result['score']:.4f}, Box: {result['box']}")
    except Exception as e:
        print(f"Error processing {name}: {e}")
