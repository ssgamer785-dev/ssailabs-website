const fs = require('fs');
let code = fs.readFileSync('src/components/SelectedWorks.tsx', 'utf-8');

const replacement = `                <button className="flex items-center gap-2 mt-4 px-6 py-3 rounded-full border border-[#333] text-sm bg-black hover:bg-white hover:text-black transition-colors group w-max">VIEW CASE STUDY <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></button>
              </div>`;

code = code.replace(/<\/div>\n              <\/div>\n              <div className="w-1\/2/g, `</div>\n${replacement}\n              <div className="w-1/2`);

fs.writeFileSync('src/components/SelectedWorks.tsx', code);
