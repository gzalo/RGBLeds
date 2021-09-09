var outputDone, outputStream;
var count = 0;

async function connect() {
  let port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });

  const encoder = new TextEncoderStream();
  outputDone = encoder.readable.pipeTo(port.writable);
  outputStream = encoder.writable;
}

function write() {
  const writer = outputStream.getWriter();
  writer.write(`X${count};Y${count};Z${count};`);
  console.log(count);
  if (count % 10 == 0)
    document.querySelector("body").style.backgroundColor = "red";
  else document.querySelector("body").style.backgroundColor = "white";

  count++;
  writer.releaseLock();
}

document.getElementById("connectButton").addEventListener("click", connect);
document.getElementById("writeButton").addEventListener("click", write);

/*unsigned char *data = stbi_load_from_file(fp,&w,&h,&comp,0);
	
	for(int i=0;i<w*h*comp;i++) if(data[i] == 0xFF) data[i] = 0xFE;
	
	for(unsigned int i=0;;i++){
		unsigned char buffer[13] = {0xFF};
		
		int y = i%h;
		
		unsigned char rA = data[(w*y+0)*comp+0];
		unsigned char gA = data[(w*y+0)*comp+1];
		unsigned char bA = data[(w*y+0)*comp+2];

		unsigned char rB = data[(w*y+1)*comp+0];
		unsigned char gB = data[(w*y+1)*comp+1];
		unsigned char bB = data[(w*y+1)*comp+2];		
		
		unsigned char rC = data[(w*y+2)*comp+0];
		unsigned char gC = data[(w*y+2)*comp+1];
		unsigned char bC = data[(w*y+2)*comp+2];		
		
		unsigned char rD = data[(w*y+3)*comp+0];
		unsigned char gD = data[(w*y+3)*comp+1];
		unsigned char bD = data[(w*y+3)*comp+2];	
				
		buffer[1+0] = bA;
		buffer[1+1] = rA;
		buffer[1+2] = gA;
		
		buffer[4+0] = bB;
		buffer[4+1] = rB;
		buffer[4+2] = gB;
		
		buffer[7+0] = bC;
		buffer[7+1] = rC;
		buffer[7+2] = gC;
		
		buffer[10+0] = bD;
		buffer[10+1] = rD;
		buffer[10+2] = gD;
		
		DWORD dwBytesSent;
		WriteFile(hSerial, buffer, 13, &dwBytesSent, NULL);
		
		Sleep(10);
	}*/