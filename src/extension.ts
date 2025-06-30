import * as http from 'http';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';

export async function setUpServers(context: vscode.ExtensionContext, delay: number) {
	const htmlServers: http.Server[] = [];
	const wsServers: Array<{ close: () => void }> = [];
	const bgColors = ['red', 'blue', 'green'];

	// Create 3 sets of HTTP Servers. Each set has a HTTP server that handles a WebSocket at /ws (and just
	// serves up a simple message of HTML at /) and another HTTP server that serves up a colourful HTML page
	// that connects to the WebSocket server and displays any messages received).
	for (let i = 0; i < 3; i++) {
		// Create the WebSocket HTTP Server.
		const wsHttpServer = http.createServer((req, res) => {
			// Force upgrade for /ws which will be handled by wsServer below.
			if (req.url === '/ws') {
				// Let ws handle the upgrade
				res.writeHead(426, { 'Content-Type': 'text/plain' });
				res.end('Upgrade Required');
			} else {
				// Otherwise, just serve up a simple HTML page.
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('<html><body>This server is only for the WebSocket server at /ws</body></html>');
			}
		});
		// Set up the WebSocket server.
		const wsServer = new WebSocket.Server({ server: wsHttpServer, path: '/ws' });
		wsServer.on('connection', (socket: WebSocket.WebSocket) => {
			socket.send(`Hello from WebSocket Server ${i}`);
		});
		wsHttpServer.listen();
		wsServers.push(wsHttpServer);
		wsServers.push(wsServer);

		// Get the URI for the WebSocket so we can connect to it from the HTML page.
		const wsPort = (wsHttpServer.address() as any).port;
		const wsUri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${wsPort}/ws`));

		// Set up an HTTP server to serve a colourful HTML page that connects to the WebSocket server.
		let htmlPort: number | undefined;
		const htmlServer = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(`
				<html>
				<body bgcolor="${bgColors[i]}" style="font-family: sans-serif">
					<h3>Server ${i} (HTML Port: ${htmlPort}, WS Port: ${wsPort})</h1>
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
		htmlPort = (htmlServer.address() as any).port;
		htmlServers.push(htmlServer);
	}

	// Get the public URI for each of the servers.
	const frameUris = await Promise.all(htmlServers.map((s) => vscode.Uri.parse(`http://localhost:${(s.address() as any).port}`)).map(vscode.env.asExternalUri));

	// The main server that shows iframes for the other servers.
	const mainServer = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(`
				<!DOCTYPE html>
				<html><body bgcolor="yellow" style="font-family: sans-serif">
					<h3>Main Server (${delay}ms delay)</h1>
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
