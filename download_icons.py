import os
import urllib.request

ICONS = {
    "user": "https://img.icons8.com/ios-filled/100/000000/user.png",
    "server": "https://img.icons8.com/ios-filled/100/000000/server.png",
    "database": "https://img.icons8.com/ios-filled/100/000000/database.png",
    "blockchain": "https://img.icons8.com/ios-filled/100/000000/blockchain-technology.png",
    "web": "https://img.icons8.com/ios-filled/100/000000/internet.png",
    "docker": "https://img.icons8.com/ios-filled/100/000000/docker.png",
    "smart_contract": "https://img.icons8.com/ios-filled/100/000000/contract.png",
    "shield": "https://img.icons8.com/ios-filled/100/000000/security-shield.png",
    "cloud": "https://img.icons8.com/ios-filled/100/000000/cloud.png",
    "code": "https://img.icons8.com/ios-filled/100/000000/code.png",
    "cpu": "https://img.icons8.com/ios-filled/100/000000/processor.png",
    "wallet": "https://img.icons8.com/ios-filled/100/000000/wallet.png"
}

SAVE_DIR = r"c:\Capstone Project\resources\icons"

def download_icons():
    print(f"Downloading icons to {SAVE_DIR}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    for name, url in ICONS.items():
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                data = response.read()
                path = os.path.join(SAVE_DIR, f"{name}.png")
                with open(path, "wb") as f:
                    f.write(data)
                print(f"Downloaded {name}.png")
        except Exception as e:
            print(f"Failed to download {name}: {e}")

if __name__ == "__main__":
    download_icons()
