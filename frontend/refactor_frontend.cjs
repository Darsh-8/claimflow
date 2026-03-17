const fs = require('fs');
const path = require('path');

const replacements = [
    { old: /['"]\.\.\/api\/client['"]/g, new: "'../client/apiClient'" },
    { old: /['"]\.\.\/services\/ai['"]/g, new: "'../service/aiService'" },
    { old: /['"]\.\.\/\.\.\/api\/client['"]/g, new: "'../../client/apiClient'" },
    { old: /['"]\.\.\/\.\.\/services\/ai['"]/g, new: "'../../service/aiService'" },
    { old: /['"]\.\/api\/client['"]/g, new: "'./client/apiClient'" },
    { old: /['"]\.\/services\/ai['"]/g, new: "'./service/aiService'" },
    { old: /from\s+['"]api\/client['"]/g, new: "from 'client/apiClient'" },
    { old: /from\s+['"]services\/ai['"]/g, new: "from 'service/aiService'" }
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules')) {
                processDirectory(fullPath);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            for (const r of replacements) {
                content = content.replace(r.old, r.new);
            }
            
            if (content !== original) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

const targetDir = path.join(__dirname, 'src');
if (fs.existsSync(targetDir)) {
    processDirectory(targetDir);
    console.log('Frontend refactoring complete.');
} else {
    console.error(`Directory not found: ${targetDir}`);
}
