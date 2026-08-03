const fs = require('fs');
let code = fs.readFileSync('src/components/SelectedWorks.tsx', 'utf-8');

const progressUI = `
            {/* Progress Indicator */}
            <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-4">
               <div className="text-[10px] text-muted">01</div>
               <div className="w-px h-24 bg-[#333] relative">
                  <div className="absolute top-0 left-0 w-full bg-white origin-top" style={{ height: "100%", transform: "scaleY(0)" }} id="scroll-progress"></div>
               </div>
               <div className="text-[10px] text-muted">04</div>
            </div>
`;

code = code.replace(
  /{[\s]*\/\* --- INTRO SCREEN --- \*\//,
  `${progressUI}\n            {/* --- INTRO SCREEN --- */}`
);

// Add GSAP for progress bar
const gsapProgress = `
        // Progress bar
        tl.to('#scroll-progress', { scaleY: 1, ease: "none", duration: 17.5 }, 0);
`;

code = code.replace(
  /\/\/ 1\. Intro fades out/,
  `${gsapProgress}\n        // 1. Intro fades out`
);

fs.writeFileSync('src/components/SelectedWorks.tsx', code);
