# Launch the Hardhat Blockchain Node in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit -Command `"title Blockchain Node; cd 'd:\Capstone Project\Decentralized-HPC-Marketplace'; npx hardhat node`""

# Wait for the node to fully start
Write-Host "Waiting 5 seconds for blockchain to initialize..."
Start-Sleep -Seconds 5

# Deploy contracts and start the Provider Node in another new window
Start-Process powershell -ArgumentList "-NoExit -Command `"title Provider Node; cd 'd:\Capstone Project\Decentralized-HPC-Marketplace'; Write-Host 'Deploying contracts...'; npx hardhat run scripts/deploy.js --network localhost; Write-Host 'Starting Provider Node...'; node provider/index.js`""

# Start the Web Server
Start-Process powershell -ArgumentList "-NoExit -Command `"title Client UI Server; cd 'd:\Capstone Project\Decentralized-HPC-Marketplace'; npx http-server client -p 8080 -c-1`""

# Wait a moment for server to start, then open the browser
Start-Sleep -Seconds 2
Start-Process "http://localhost:8080"

Write-Host "Demonstration environment launched successfully!"
