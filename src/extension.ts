import * as http from 'http';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';

export async function setUpServers(context: vscode.ExtensionContext, delay: number) {
	const htmlServers: http.Server[] = [];
	const wsServers: Array<{ close: () => void }> = [];
	const bgColors = ['red', 'blue', 'green'];

	// 3 "Hello World" servers which consist ot a HTTP server that serves a simple HTML page
	// and a WebSocket server that sends a "Hello World" message on connection.
	for (let i = 0; i < 3; i++) {
		// Create the WebSocket server and a HTTP server to support it.
		const wsHttpServer = http.createServer();
		const wsServer = new WebSocket.Server({ server: wsHttpServer });
		wsServer.on('connection', (socket: WebSocket.WebSocket) => {
			socket.send('Hello from WebSocket Server ${i}');
		});
		wsHttpServer.listen();
		wsServers.push(wsHttpServer);
		wsServers.push(wsServer);

		// Get the URI for the WebSocket.
		const wsPort = (wsHttpServer.address() as any).port;
		const wsUri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${wsPort}`));

		const htmlServer = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(`
				<html>
				<body bgcolor="${bgColors[i]}" style="font-family: sans-serif">
					<h1>Server ${i}</h1>
					<script>
						function append(s) {
							const msg = document.createElement('p');
							msg.textContent = s;
							document.body.appendChild(msg);
						}
						const ws = new WebSocket('${wsUri}');
						ws.onmessage = function(event) {
							append(event.data);
						};
						ws.onopen = function() {
							append('WebSocket connected');
						};
						ws.onerror = function(e) {
							append(\`WebSocket error: \${e}\`);
						};
					</script>
				</body>
				</html>
			`);
		});
		htmlServer.listen();
		htmlServers.push(htmlServer);
	}

	const frameUris = await Promise.all(htmlServers.map((s) => vscode.Uri.parse(`http://localhost:${(s.address() as any).port}`)).map(vscode.env.asExternalUri));

	// Main server that just shows iframes for the others.
	const mainServer = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(`
				<!DOCTYPE html>
				<html><body bgcolor="yellow">
					<h1 style="font-family: sans-serif">Main Server (${delay}ms delay)</h1>
					${frameUris.map((uri) => `<iframe src="${uri}" width="500" height="150"></iframe><br/>`).join("\n")}
				</body></html>
			`);
	});
	mainServer.listen();
	htmlServers.push(mainServer);
	const mainUri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${(mainServer.address() as any).port}`));

	// Now open an embedded editor webview that points to the main server.
	const panel = vscode.window.createWebviewPanel(
		'helloWorld',
		'Hello World',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: []
		}
	);

	panel.webview.html = `
		<html>
		<body>
		<h1 style="font-family: sans-serif">Panel HTML</h1>
		<iframe id="x" src="${mainUri}" width="600" height="750"></iframe>
		</body>
		</html>
	`;

	context.subscriptions.push({
		dispose: () => {
			htmlServers.forEach(server => server.close());
			wsServers.forEach(ws => ws.close());
		}
	});
}

export async function activate(context: vscode.ExtensionContext) {
	const delay = vscode.workspace.getConfiguration('portTest').get<number>('delay', 0);

	if (delay) {
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
	await setUpServers(context, delay);
}
