// PAUSD Common Core curriculum catalog — middle-school + high-school-entry
// math and science. Designed at PAUSD rigor (above the standard CC label —
// PAUSD is a notoriously hard district), Khan-Academy-style structure:
// each course has 5-11 units, each unit has 4-8 lessons, each lesson is a
// CONCRETE skill the student walks away able to do. Lesson content itself
// is generated on-demand by the lesson-chat AI using the new directive +
// harder-than-the-label prompts (the AI sees lesson title + the COURSE
// MEMORY block built from scores of prior lessons).
//
// Shape exported here is a TEMPLATE — IDs and per-unit math-tutor /
// practice / unit-test lessons are added at enrollment time so existing
// curriculum machinery (lesson chat, math tutor, assessments) all light
// up unchanged.
//
// Each course's `subject` drives whether enrollment adds math-tutor +
// practice lessons (subject === 'math') or graded essays (otherwise).

export const PAUSD_CATALOG = [
  // =====================================================================
  // MATH — Math 6 → Geometry Honors
  // =====================================================================
  {
    slug: 'math-6',
    title: 'PAUSD Math 6',
    description: 'Common Core 6 + PAUSD-rigor: ratios, rational numbers, equations, geometry, statistics. Above-grade-level expectations from day one.',
    subject: 'math',
    grade: '6',
    difficulty: 'advanced',
    units: [
      {
        title: 'Ratios, Rates, and Proportional Reasoning',
        description: 'Ratios as multiplicative relationships, unit rates, complex unit conversions, percent as a ratio.',
        lessons: [
          { title: 'Ratios as multiplicative comparisons (a:b vs a/b)', description: 'Distinguish ratios from fractions, write equivalent ratios, build ratio tables, scale up and down.' },
          { title: 'Unit rates with non-trivial denominators', description: 'Find unit rates including fractional and decimal denominators; use them to compare two rates.' },
          { title: 'Solving rate problems with double number lines', description: 'Use double number lines and tape diagrams to solve rate problems, including better-buy and density questions.' },
          { title: 'Percent as a ratio per 100 and percent equations', description: 'Translate between percent, decimal, fraction; solve "X is what percent of Y", "P% of Y is X", and inverse-percent problems.' },
          { title: 'Percent of change and percent error', description: 'Compute percent increase, percent decrease, and percent error; reason about reversible vs irreversible change.' },
          { title: 'Multi-step unit conversions across systems', description: 'Convert between metric and customary using ratios; chain multiple conversions (e.g., mph to m/s).' },
          { title: 'Proportional reasoning with constant of proportionality', description: 'Recognize y = kx in tables and graphs; identify k and use it to extend the relationship.' },
          { title: 'Word problems mixing rate, ratio, and percent', description: 'Solve multi-stage problems requiring two or more of: rate, ratio, percent, conversion.' },
        ],
      },
      {
        title: 'The Rational Number System',
        description: 'Negatives, absolute value, fraction division, and decimal operations with full algorithmic fluency.',
        lessons: [
          { title: 'Integers on the number line and ordering', description: 'Plot, compare, and order integers and rationals; reason about absolute value as distance.' },
          { title: 'Absolute value as distance and inequalities', description: 'Solve |x| < a and |x| > a as compound inequalities; interpret absolute-value statements in context.' },
          { title: 'Adding and subtracting rationals on the number line', description: 'Use the number line to develop sign rules; subtract by adding the additive inverse.' },
          { title: 'Multiplying and dividing rationals; sign rules from patterns', description: 'Derive sign rules from patterns; apply distributivity to mixed-sign problems.' },
          { title: 'Dividing fractions including complex fractions', description: 'Divide a fraction by a fraction; interpret a/b ÷ c/d in context; simplify complex fractions.' },
          { title: 'Decimal operations with full precision', description: 'Add, subtract, multiply, and divide multi-digit decimals; convert between fraction and decimal forms exactly.' },
          { title: 'Quadrants and signed coordinate distances', description: 'Plot points in all four quadrants; compute distances along axes; reflect across axes by negating coordinates.' },
        ],
      },
      {
        title: 'Expressions and One-Variable Equations',
        description: 'Algebraic expressions, exponents, equation-solving with rational coefficients.',
        lessons: [
          { title: 'Translating words to algebraic expressions', description: 'Express verbal phrases algebraically including "less than", "twice the sum", "the quantity"; identify common pitfalls.' },
          { title: 'Whole-number exponents and order of operations', description: 'Evaluate expressions with exponents; apply order of operations including nested grouping.' },
          { title: 'Distributive property and factoring out a GCF', description: 'Apply distributive property forwards and backwards; factor out greatest common factors from expressions.' },
          { title: 'Equivalent expressions: combining like terms', description: 'Identify and combine like terms; verify equivalence by substitution.' },
          { title: 'One-step equations with rational coefficients', description: 'Solve x + a = b and ax = b where a, b are positive or negative rationals.' },
          { title: 'Two-step equations and word problem translation', description: 'Solve ax + b = c equations; translate two-step word problems into equations and solve.' },
          { title: 'Inequalities and graphing on a number line', description: 'Solve one-variable inequalities; graph solutions; interpret open vs closed circles.' },
        ],
      },
      {
        title: 'Geometry: Area, Surface Area, and Volume',
        description: 'Polygons, polyhedra, nets, surface area, and volume of right prisms.',
        lessons: [
          { title: 'Area of triangles, parallelograms, trapezoids by decomposition', description: 'Derive area formulas by decomposing into rectangles and triangles; apply to non-standard polygons.' },
          { title: 'Area of irregular polygons on a grid', description: 'Find areas of composite figures by decomposition and subtraction.' },
          { title: 'Volume of right rectangular prisms with fractional edges', description: 'Compute volumes when edges are fractions; reason about why V = lwh works for fractional edges.' },
          { title: 'Surface area from nets', description: 'Draw nets for prisms and pyramids; compute surface area by summing face areas.' },
          { title: 'Distance and perimeter on the coordinate plane', description: 'Find distances between points sharing a coordinate; compute perimeters of coordinate polygons.' },
          { title: 'Multi-step composite-figure problems', description: 'Solve mixed problems requiring area, surface area, and volume in the same context.' },
        ],
      },
      {
        title: 'Statistical Reasoning and Distributions',
        description: 'Statistical questions, measures of center and spread, and visual representations.',
        lessons: [
          { title: 'Statistical vs non-statistical questions', description: 'Identify questions that anticipate variability; rewrite weak questions to be statistical.' },
          { title: 'Mean, median, and mode with outlier sensitivity', description: 'Compute and interpret each measure; reason about which is most appropriate when an outlier is present.' },
          { title: 'Mean absolute deviation and interquartile range', description: 'Compute MAD and IQR; compare two distributions using both center and spread.' },
          { title: 'Dot plots, histograms, and box plots', description: 'Construct and interpret all three; choose the right plot for a given question.' },
          { title: 'Comparing distributions in context', description: 'Use shape, center, and spread to compare two data sets and answer a contextual question.' },
        ],
      },
    ],
  },

  {
    slug: 'math-7',
    title: 'PAUSD Math 7',
    description: 'Common Core 7 with PAUSD rigor: rational operations, proportional relationships, multi-step equations, geometry, statistics, and probability.',
    subject: 'math',
    grade: '7',
    difficulty: 'advanced',
    units: [
      {
        title: 'Operations with Rational Numbers',
        description: 'Full fluency with signed rationals, including order of operations and complex fractions.',
        lessons: [
          { title: 'Adding and subtracting signed rationals', description: 'Apply sign rules to mixed-sign sums and differences with fractions and decimals.' },
          { title: 'Multiplying and dividing signed rationals', description: 'Apply sign rules to multi-step products and quotients; interpret negative answers in context.' },
          { title: 'Order of operations with negatives and exponents', description: 'Evaluate expressions where exponentiation interacts with negative bases vs negative coefficients.' },
          { title: 'Complex fractions and converting between forms', description: 'Simplify complex fractions; convert exact rationals between fraction, decimal, and percent forms.' },
          { title: 'Repeating decimals and rationality', description: 'Convert repeating decimals to fractions using the algebraic method; classify numbers as rational vs irrational.' },
          { title: 'Word problems mixing rational operations', description: 'Solve multi-step contextual problems requiring chained rational operations.' },
        ],
      },
      {
        title: 'Proportional Relationships',
        description: 'Recognizing, representing, and using proportional relationships in tables, graphs, and equations.',
        lessons: [
          { title: 'Identifying proportional relationships in tables', description: 'Test for a constant ratio; distinguish proportional from merely linear relationships.' },
          { title: 'Constant of proportionality from tables, graphs, equations', description: 'Find k from each representation; translate between representations.' },
          { title: 'Graphs of proportional relationships and the unit rate', description: 'Recognize graphs through origin with constant slope; interpret the unit rate as the slope.' },
          { title: 'Multi-step percent problems: discount, tax, tip, markup', description: 'Solve real-world percent problems including chained percent operations.' },
          { title: 'Simple interest and percent change over time', description: 'Compute simple interest; reason about percent change applied repeatedly.' },
          { title: 'Scale drawings and similar figures preview', description: 'Use scale factors to compute lengths and areas; reason about how area scales with the square of the linear factor.' },
        ],
      },
      {
        title: 'Multi-Step Equations and Inequalities',
        description: 'Solving equations and inequalities with variables on both sides and rational coefficients.',
        lessons: [
          { title: 'Distributive property and combining like terms in equations', description: 'Solve ax + b = c(x + d) with full algebraic manipulation.' },
          { title: 'Equations with variables on both sides', description: 'Solve equations like 3x + 7 = 5x − 9 with full justification of each step.' },
          { title: 'Equations with rational coefficients', description: 'Clear fractions by multiplying through by the LCD; solve for x.' },
          { title: 'Identifying equations with no solution or infinite solutions', description: 'Recognize identities and contradictions algebraically and graphically.' },
          { title: 'Setting up equations from word problems (consecutive integers, mixture)', description: 'Translate complex contexts into equations; solve and interpret the answer.' },
          { title: 'Solving and graphing multi-step inequalities', description: 'Solve compound and multi-step inequalities; graph on a number line.' },
          { title: 'Inequality word problems', description: 'Translate budget, capacity, and threshold problems into inequalities; interpret the solution set.' },
        ],
      },
      {
        title: 'Scale, Similarity, and Constructions',
        description: 'Scale drawings, similar figures, and basic compass-and-straightedge constructions.',
        lessons: [
          { title: 'Scale drawings, scale factor, and reproducing at a new scale', description: 'Solve scale problems including non-integer factors; convert dimensions and areas.' },
          { title: 'Similar figures and the scale-factor / area / volume rule', description: 'Reason about k for length, k² for area, k³ for volume in similar figures.' },
          { title: 'Constructing triangles from given side and angle information', description: 'Determine when given conditions yield a unique, no, or many triangles.' },
          { title: 'Cross-sections of three-dimensional figures', description: 'Identify cross-sections of prisms, pyramids, cylinders, cones, and spheres.' },
          { title: 'Constructions with compass and straightedge: bisectors, perpendiculars', description: 'Bisect segments and angles; drop a perpendicular from a point to a line.' },
        ],
      },
      {
        title: 'Angle Relationships and Triangles',
        description: 'Angle pairs, triangle inequality, exterior-angle theorem, and circumference / area of circles.',
        lessons: [
          { title: 'Vertical, complementary, supplementary, and adjacent angles', description: 'Identify angle pairs and write equations to solve for unknown angles.' },
          { title: 'Parallel lines cut by a transversal', description: 'Identify and apply alternate interior, alternate exterior, corresponding, and co-interior angle relationships.' },
          { title: 'Triangle angle-sum theorem and exterior-angle theorem', description: 'Prove and apply the angle-sum theorem; apply the exterior-angle theorem to find unknown angles.' },
          { title: 'Triangle inequality theorem', description: 'Determine when three given side lengths form a triangle; reason about the range of the third side.' },
          { title: 'Circumference, area of a circle, and π', description: 'Derive C = 2πr and A = πr²; solve composite-figure problems involving circles.' },
        ],
      },
      {
        title: 'Probability Models and Compound Events',
        description: 'Theoretical and experimental probability, simulations, and compound events.',
        lessons: [
          { title: 'Theoretical vs experimental probability', description: 'Distinguish between the two; reason about how experimental probability converges to theoretical with more trials.' },
          { title: 'Sample spaces and uniform probability models', description: 'List sample spaces for compound events; compute probabilities under uniform models.' },
          { title: 'Compound events: tree diagrams and the multiplication rule', description: 'Use tree diagrams and the counting principle to compute compound-event probabilities.' },
          { title: 'Independent and dependent events', description: 'Distinguish the two; compute conditional probabilities for dependent events.' },
          { title: 'Simulations to estimate probabilities', description: 'Design simulations using random digits or technology; estimate probabilities and assess accuracy.' },
        ],
      },
      {
        title: 'Sampling, Inference, and Comparing Populations',
        description: 'Random sampling, statistical inference, and comparison of populations.',
        lessons: [
          { title: 'Random sampling and bias', description: 'Identify biased and unbiased sampling methods; reason about why random samples generalize.' },
          { title: 'Estimating population parameters from sample statistics', description: 'Use sample means and proportions to estimate population values; reason about variability of estimates.' },
          { title: 'Comparing two populations using box plots and means', description: 'Compare two distributions visually and numerically; quantify the difference using MAD or IQR.' },
          { title: 'Drawing inferences with appropriate caveats', description: 'State conclusions from data with appropriate hedging based on sample size and method.' },
        ],
      },
    ],
  },

  {
    slug: 'math-7a',
    title: 'PAUSD Math 7A (Accelerated)',
    description: 'Compacted Math 7 + first half of Math 8 in one year. PAUSD-accelerated track for advanced students. Pace is fast and rigor is honors-level.',
    subject: 'math',
    grade: '7',
    difficulty: 'advanced',
    units: [
      {
        title: 'Operations with Rational and Real Numbers',
        description: 'Full rational fluency plus an introduction to irrational numbers and exact-value reasoning.',
        lessons: [
          { title: 'Signed-rational arithmetic at speed', description: 'Combine all four operations on signed rationals with full speed and accuracy.' },
          { title: 'Order of operations with exponents and grouping', description: 'Evaluate expressions with negative bases, nested grouping, and chained exponentiation.' },
          { title: 'Repeating decimals and the structure of rationals', description: 'Convert repeating decimals to exact fractions; reason about the divisibility behind the period length.' },
          { title: 'Square roots and the appearance of irrationals', description: 'Identify perfect-square roots vs irrational roots; estimate irrationals by squeezing between rationals.' },
          { title: 'Approximating irrationals to a given precision', description: 'Estimate values like √2 and π to a specified decimal precision without a calculator.' },
          { title: 'Classification of real numbers and Venn diagrams', description: 'Place a number into ℕ, ℤ, ℚ, or ℝ\\ℚ; explain the nesting.' },
        ],
      },
      {
        title: 'Proportional Relationships and Linear Functions',
        description: 'Proportional → linear → function-notation preview, all in one tight arc.',
        lessons: [
          { title: 'Proportional relationships in three representations', description: 'Move fluently between table, graph, and equation y = kx.' },
          { title: 'Slope as the constant of proportionality', description: 'Recognize that slope is the unit rate; compute slope from any pair of points.' },
          { title: 'From proportional to linear: the y-intercept', description: 'Generalize y = kx to y = mx + b; reason about what shifts and what stays.' },
          { title: 'Slope-intercept form: graphing and interpretation', description: 'Graph y = mx + b given any m, b; interpret slope and intercept in context.' },
          { title: 'Point-slope and standard forms; converting between forms', description: 'Move between y − y₁ = m(x − x₁), y = mx + b, and Ax + By = C.' },
          { title: 'Function notation preview: f(x), input, output', description: 'Read and write function notation; evaluate f(a) and solve f(x) = b.' },
          { title: 'Modeling word problems with linear functions', description: 'Build linear models from contexts; interpret slope and intercept in real units.' },
        ],
      },
      {
        title: 'Multi-Step Equations, Inequalities, and Systems',
        description: 'Equation-solving fluency through systems of two linear equations.',
        lessons: [
          { title: 'Solving multi-step equations with rational coefficients', description: 'Clear denominators, distribute, combine, and isolate; full algebraic justification.' },
          { title: 'Equations with variables on both sides and identities/contradictions', description: 'Solve, recognize identities and contradictions, and explain what each means about the lines.' },
          { title: 'Compound and absolute-value inequalities', description: 'Solve "and"/"or" inequalities and absolute-value inequalities; graph on a number line.' },
          { title: 'Systems by graphing', description: 'Solve 2x2 linear systems by graphing; recognize parallel and coincident systems.' },
          { title: 'Systems by substitution', description: 'Solve 2x2 systems by substitution; choose the easier variable to isolate.' },
          { title: 'Systems by elimination, including scaling both equations', description: 'Solve 2x2 systems by elimination; scale one or both equations to align coefficients.' },
          { title: 'Systems word problems: mixture, work, distance', description: 'Translate word problems into 2x2 systems; solve and interpret.' },
          { title: 'Systems with no solution and infinite solutions', description: 'Recognize each case algebraically and graphically; explain in plain English.' },
        ],
      },
      {
        title: 'Geometry: Scale, Similarity, and Transformations',
        description: 'Scale drawings, similar figures, congruence, and the four basic rigid transformations.',
        lessons: [
          { title: 'Scale factor and area/volume scaling', description: 'Apply k for length, k² for area, k³ for volume; solve composite-figure scale problems.' },
          { title: 'Translations, reflections, and rotations on the coordinate plane', description: 'Apply each rigid motion to coordinates; verify that side and angle measures are preserved.' },
          { title: 'Compositions of rigid motions', description: 'Compose two transformations and predict the resulting figure; reason about whether order matters.' },
          { title: 'Dilations and the center of dilation', description: 'Apply dilations centered at the origin and at non-origin points; identify the scale factor.' },
          { title: 'Similarity vs congruence and the AA criterion preview', description: 'Distinguish congruence from similarity; preview AA similarity in triangles.' },
          { title: 'Angle theorems for parallel lines', description: 'Apply alternate interior, corresponding, co-interior, and exterior angle relationships.' },
          { title: 'Multi-step transformation and similarity problems', description: 'Solve problems combining transformations, similarity, and angle theorems.' },
        ],
      },
      {
        title: 'Pythagorean Theorem and Distance',
        description: 'Pythagorean theorem, its converse, and applications to coordinate geometry.',
        lessons: [
          { title: 'Proof and intuition for the Pythagorean theorem', description: 'See at least two proofs (rearrangement and similar-triangle); reason about why they work.' },
          { title: 'Applications to right-triangle problems', description: 'Apply Pythagoras to solve missing-side problems including 3D scenarios.' },
          { title: 'Converse of the Pythagorean theorem and right-triangle test', description: 'Apply the converse to determine whether three lengths form a right triangle.' },
          { title: 'Distance formula on the coordinate plane', description: 'Derive the distance formula from Pythagoras; apply it to coordinate geometry problems.' },
        ],
      },
      {
        title: 'Probability and Statistical Inference',
        description: 'Compound events, simulations, and bivariate data with scatter plots.',
        lessons: [
          { title: 'Compound events with replacement and without replacement', description: 'Compute compound probabilities for both cases; reason about how the second event\'s sample space changes.' },
          { title: 'Conditional probability and independence', description: 'Compute conditional probabilities; test for independence using P(A and B) = P(A)·P(B).' },
          { title: 'Sampling distributions and variability', description: 'Reason about how a sample statistic varies across samples; preview the law of large numbers.' },
          { title: 'Scatter plots and lines of best fit', description: 'Construct scatter plots; draw a reasonable line of best fit by eye and interpret slope.' },
          { title: 'Two-way frequency tables and association', description: 'Build two-way tables, compute relative frequencies, and assess association between categorical variables.' },
        ],
      },
    ],
  },

  {
    slug: 'math-8',
    title: 'PAUSD Math 8',
    description: 'Common Core 8 at PAUSD rigor: real numbers, linear functions, systems, Pythagorean theorem, transformations, and bivariate data.',
    subject: 'math',
    grade: '8',
    difficulty: 'advanced',
    units: [
      {
        title: 'Real Numbers and Exponents',
        description: 'Irrationals, integer and zero exponents, and scientific notation.',
        lessons: [
          { title: 'Rational vs irrational numbers and the real number line', description: 'Classify numbers as rational or irrational; place irrationals on the number line.' },
          { title: 'Approximating irrationals using truncation and squeezing', description: 'Estimate √2, √3, π, and similar values to a chosen precision.' },
          { title: 'Integer exponents: product, quotient, power-of-a-power rules', description: 'Apply exponent rules to simplify expressions; explain why each rule works.' },
          { title: 'Negative and zero exponents from the quotient rule', description: 'Derive a⁰ = 1 and a⁻ⁿ = 1/aⁿ from the quotient rule; apply to numeric and algebraic expressions.' },
          { title: 'Scientific notation and operations in scientific notation', description: 'Add, subtract, multiply, and divide in scientific notation; reason about magnitude.' },
          { title: 'Square and cube roots, and solving x² = a, x³ = a', description: 'Solve quadratic-root and cubic-root equations; interpret positive vs negative roots.' },
        ],
      },
      {
        title: 'Linear Equations and Functions',
        description: 'Slopes, equations of lines, and function notation through linear modeling.',
        lessons: [
          { title: 'Slope as rise over run; computing slope from two points', description: 'Compute slope between any two points; reason about positive, negative, zero, and undefined slope.' },
          { title: 'Slope-intercept form: graphing and writing equations', description: 'Graph y = mx + b given m and b; write the equation given a graph.' },
          { title: 'Point-slope form and converting between forms', description: 'Use y − y₁ = m(x − x₁); convert to slope-intercept and standard forms.' },
          { title: 'Equations of horizontal, vertical, parallel, and perpendicular lines', description: 'Recognize and write equations for each special case; reason about why slopes work the way they do.' },
          { title: 'Functions: definition, vertical line test, function notation', description: 'Define a function; apply the vertical line test; evaluate f(x).' },
          { title: 'Linear vs nonlinear functions from tables and graphs', description: 'Classify functions; recognize signature shapes of nonlinear functions like quadratic and exponential.' },
          { title: 'Modeling word problems with linear functions', description: 'Build linear models, including those with non-zero y-intercept; interpret slope and intercept.' },
          { title: 'Comparing two linear functions in different representations', description: 'Compare two functions where each is given in a different form (table, graph, equation, words).' },
        ],
      },
      {
        title: 'Systems of Linear Equations',
        description: 'Solving 2x2 systems by graphing, substitution, and elimination, with full word-problem applications.',
        lessons: [
          { title: 'Systems by graphing and interpreting the intersection', description: 'Solve 2x2 systems by graphing; interpret the intersection in context.' },
          { title: 'Systems by substitution', description: 'Solve 2x2 systems by substitution; identify the easier variable to isolate.' },
          { title: 'Systems by elimination with scaling', description: 'Solve 2x2 systems by elimination; scale equations to align coefficients.' },
          { title: 'Systems with no solution and infinite solutions', description: 'Recognize and explain each case algebraically and graphically.' },
          { title: 'Systems word problems: mixture, age, distance, work', description: 'Translate word problems into systems; solve and interpret with units.' },
        ],
      },
      {
        title: 'Pythagorean Theorem and Distance',
        description: 'Right-triangle reasoning and applications to 2D and 3D problems.',
        lessons: [
          { title: 'Pythagorean theorem and at least two proofs', description: 'Apply Pythagoras; understand a rearrangement proof and a similar-triangle proof.' },
          { title: 'Converse and the right-triangle test', description: 'Use the converse to determine whether three lengths form a right triangle.' },
          { title: 'Pythagorean problems in 3D (diagonals of boxes)', description: 'Apply Pythagoras twice to find space diagonals of rectangular prisms.' },
          { title: 'Distance formula on the coordinate plane', description: 'Derive and apply the distance formula; use it to solve coordinate-geometry problems.' },
          { title: 'Mixed Pythagorean word problems', description: 'Solve real-world problems involving ladders, ramps, distances on a map, and 3D objects.' },
        ],
      },
      {
        title: 'Transformations and Congruence',
        description: 'Translations, reflections, rotations, and the definition of congruence via rigid motions.',
        lessons: [
          { title: 'Translations on the coordinate plane', description: 'Apply translation rules; reason about which properties are preserved.' },
          { title: 'Reflections across axes and lines y = x, y = −x', description: 'Apply reflection rules across multiple lines; reason about distance to the line.' },
          { title: 'Rotations of 90°, 180°, and 270° about the origin', description: 'Apply rotation rules; reason about orientation and congruence.' },
          { title: 'Compositions of rigid motions', description: 'Compose two or three rigid motions; predict the resulting figure.' },
          { title: 'Congruence as a sequence of rigid motions', description: 'Define congruence in terms of rigid motions; verify congruence by finding a sequence of transformations.' },
          { title: 'Symmetry: line symmetry and rotational symmetry', description: 'Identify symmetries of figures; reason about why each symmetry preserves the figure.' },
        ],
      },
      {
        title: 'Similarity and Dilations',
        description: 'Dilations, similar figures, and the AA similarity criterion.',
        lessons: [
          { title: 'Dilations centered at the origin and at other points', description: 'Apply dilation rules; identify the center and scale factor from the image.' },
          { title: 'Similarity as dilation + rigid motion', description: 'Define similarity in terms of transformations; verify similarity by finding a sequence.' },
          { title: 'AA similarity criterion and triangle similarity', description: 'Apply AA to prove triangles similar; use similarity to find unknown sides.' },
          { title: 'Slope as a similar-triangle invariant', description: 'Argue why slope is constant on a line using similar triangles.' },
          { title: 'Indirect measurement using similar triangles', description: 'Apply similarity to measure heights, distances, and inaccessible lengths.' },
        ],
      },
      {
        title: 'Bivariate Data, Scatter Plots, Two-Way Tables',
        description: 'Visualizing and analyzing relationships between two variables.',
        lessons: [
          { title: 'Scatter plots and patterns of association', description: 'Construct scatter plots; describe patterns including outliers, clusters, linear vs nonlinear.' },
          { title: 'Lines of best fit and informal residual reasoning', description: 'Draw a line of best fit by eye; reason about why some points are far from the line.' },
          { title: 'Equations of a line of best fit and prediction', description: 'Write the equation of a fitted line; use it for prediction and interpolation.' },
          { title: 'Two-way frequency tables and relative frequency', description: 'Build two-way tables; compute joint, marginal, and conditional relative frequencies.' },
          { title: 'Identifying association in two-way tables', description: 'Compare row or column relative frequencies; assess association between categorical variables.' },
        ],
      },
    ],
  },

  {
    slug: 'algebra-1',
    title: 'PAUSD Algebra 1',
    description: 'Full first-year algebra at PAUSD rigor: linear and quadratic functions, polynomials, factoring, exponential growth, and bivariate statistics.',
    subject: 'math',
    grade: '8-9',
    difficulty: 'advanced',
    units: [
      {
        title: 'Foundations of Functions',
        description: 'Sets, function notation, domain, range, and the function machine.',
        lessons: [
          { title: 'Functions as input/output rules and function notation', description: 'Define functions formally; evaluate f(a) and solve f(x) = b.' },
          { title: 'Domain and range from graphs and equations', description: 'Find domain and range; reason about restrictions imposed by context.' },
          { title: 'Vertical line test and function vs relation', description: 'Distinguish functions from relations; apply the vertical line test.' },
          { title: 'Piecewise-defined functions: evaluation and graphing', description: 'Evaluate piecewise functions; graph by piece and check continuity at break points.' },
          { title: 'Composition of functions: f(g(x))', description: 'Compose two functions; evaluate compositions and write composition expressions.' },
        ],
      },
      {
        title: 'Linear Equations and Inequalities',
        description: 'Solving, graphing, and writing linear equations and inequalities.',
        lessons: [
          { title: 'Solving multi-step linear equations', description: 'Solve equations with distribution, combining like terms, and variables on both sides.' },
          { title: 'Literal equations: solving for a specified variable', description: 'Manipulate formulas to isolate a chosen variable.' },
          { title: 'Slope and rate of change in context', description: 'Compute and interpret slope in real units; reason about positive, negative, zero, and undefined slope.' },
          { title: 'Writing linear equations from contexts and graphs', description: 'Build linear equations from descriptions, two points, slope-and-point, or a graph.' },
          { title: 'Parallel and perpendicular lines', description: 'Use slope relationships to write equations of parallel and perpendicular lines.' },
          { title: 'Linear inequalities in one variable', description: 'Solve and graph; reason about flipping the inequality when multiplying by a negative.' },
          { title: 'Compound and absolute-value inequalities', description: 'Solve "and" and "or" inequalities; solve absolute-value inequalities.' },
          { title: 'Linear inequalities in two variables and half-planes', description: 'Graph linear inequalities in two variables; shade the correct half-plane.' },
        ],
      },
      {
        title: 'Systems of Equations and Inequalities',
        description: 'Solving 2x2 systems by all three methods, plus systems of inequalities.',
        lessons: [
          { title: 'Systems by graphing and three solution cases', description: 'Solve by graphing; classify systems as consistent independent, inconsistent, or dependent.' },
          { title: 'Systems by substitution', description: 'Solve by substitution; choose the cleanest variable to isolate.' },
          { title: 'Systems by elimination including scaling both equations', description: 'Solve by elimination; scale to align coefficients.' },
          { title: 'Systems word problems: mixture, work, distance, age', description: 'Translate word problems into systems; solve and interpret with units.' },
          { title: 'Systems of linear inequalities and feasible regions', description: 'Graph systems of inequalities; identify the feasible region and its vertices.' },
        ],
      },
      {
        title: 'Exponents and Polynomials',
        description: 'Exponent rules, polynomial operations, and special products.',
        lessons: [
          { title: 'Exponent rules: product, quotient, power-of-a-power', description: 'Apply rules to simplify expressions; reason about why each rule works.' },
          { title: 'Negative and zero exponents', description: 'Derive a⁰ = 1 and a⁻ⁿ = 1/aⁿ; apply to algebraic expressions.' },
          { title: 'Polynomial vocabulary, classification, and standard form', description: 'Classify polynomials by degree and number of terms; write in standard form.' },
          { title: 'Adding and subtracting polynomials', description: 'Combine polynomials; collect like terms across multi-variable polynomials.' },
          { title: 'Multiplying polynomials and the FOIL/area model', description: 'Multiply polynomials by distribution and area model; verify with FOIL where applicable.' },
          { title: 'Special products: difference of squares and perfect-square trinomials', description: 'Recognize and expand (a+b)², (a−b)², and (a+b)(a−b).' },
        ],
      },
      {
        title: 'Factoring',
        description: 'Factoring techniques from GCF through grouping and the AC method.',
        lessons: [
          { title: 'Factoring out the greatest common factor', description: 'Find the GCF of a polynomial and factor it out cleanly.' },
          { title: 'Factoring trinomials of the form x² + bx + c', description: 'Factor monic trinomials by finding the right pair of integers.' },
          { title: 'Factoring trinomials of the form ax² + bx + c (AC method)', description: 'Factor non-monic trinomials using the AC method or grouping.' },
          { title: 'Difference of squares and perfect-square trinomials in reverse', description: 'Recognize and factor a² − b² and a² ± 2ab + b².' },
          { title: 'Factoring by grouping (four-term polynomials)', description: 'Factor four-term polynomials by grouping; recognize when grouping is the right approach.' },
        ],
      },
      {
        title: 'Quadratic Functions and Equations',
        description: 'Graphing parabolas, solving by all methods, and modeling with quadratics.',
        lessons: [
          { title: 'Graphing y = ax² and y = a(x − h)² + k (vertex form)', description: 'Graph parabolas in vertex form; identify vertex, axis of symmetry, and direction of opening.' },
          { title: 'Graphing y = ax² + bx + c (standard form) and finding the vertex', description: 'Find the vertex using x = −b/(2a); graph from standard form.' },
          { title: 'Solving quadratics by factoring', description: 'Solve ax² + bx + c = 0 by factoring; apply the zero-product property.' },
          { title: 'Solving quadratics by taking square roots', description: 'Solve quadratics of the form (x − h)² = k; reason about when there are 0, 1, or 2 solutions.' },
          { title: 'Completing the square', description: 'Solve quadratics by completing the square; convert standard form to vertex form.' },
          { title: 'The quadratic formula and the discriminant', description: 'Derive and apply the quadratic formula; use the discriminant to predict solution count.' },
          { title: 'Choosing the best method to solve a quadratic', description: 'Match the method (factor, square root, complete the square, formula) to the equation.' },
          { title: 'Modeling with quadratic functions: projectile and area problems', description: 'Build quadratic models; interpret vertex, intercepts, and zeros in context.' },
        ],
      },
      {
        title: 'Exponential Functions',
        description: 'Exponential growth, decay, and comparing linear vs exponential models.',
        lessons: [
          { title: 'Exponential functions: y = a·bˣ', description: 'Graph exponential functions; identify a (initial value) and b (growth/decay factor).' },
          { title: 'Exponential growth and decay in context', description: 'Build models of the form y = a(1 + r)ᵗ and y = a(1 − r)ᵗ; interpret r in context.' },
          { title: 'Comparing linear vs exponential growth', description: 'Reason about why exponential growth eventually outpaces any linear function.' },
          { title: 'Exponential equations solvable by inspection', description: 'Solve a·bˣ = c when c is a clean power of b; reason about when logs would be needed.' },
          { title: 'Compound interest and percent growth', description: 'Apply A = P(1 + r/n)ⁿᵗ to compound-interest problems; compare compounding frequencies.' },
        ],
      },
      {
        title: 'Statistics and Bivariate Data',
        description: 'Univariate and bivariate statistics with linear regression.',
        lessons: [
          { title: 'Center, spread, and shape of distributions', description: 'Compute and interpret mean, median, range, IQR, standard deviation; describe shape.' },
          { title: 'Scatter plots, correlation, and causation', description: 'Construct scatter plots; assess strength and direction; distinguish correlation from causation.' },
          { title: 'Lines of best fit and least-squares regression', description: 'Compute or use technology to find the regression line; interpret slope and intercept.' },
          { title: 'Residuals and assessing fit', description: 'Compute residuals; build residual plots; reason about whether a linear model is appropriate.' },
          { title: 'Two-way tables and conditional relative frequency', description: 'Build two-way tables; compute conditional relative frequencies and assess association.' },
        ],
      },
    ],
  },

  {
    slug: 'algebra-1-honors',
    title: 'PAUSD Algebra 1 Honors',
    description: 'Honors-pace Algebra 1: deeper proofs, more complex modeling, sequences, radical and rational expressions, and a logarithm preview.',
    subject: 'math',
    grade: '8-9',
    difficulty: 'advanced',
    units: [
      {
        title: 'Functions, Domain, Range, and Function Notation',
        description: 'A rigorous introduction to functions, including composition and inverses.',
        lessons: [
          { title: 'Functions, mappings, and the formal definition', description: 'Define functions in set-theoretic terms; reason about why the vertical line test characterizes functions.' },
          { title: 'Domain and range from equations, graphs, and contexts', description: 'Find domain and range; reason about restrictions including division-by-zero and even-root nonnegativity.' },
          { title: 'Function notation, evaluation, and solving f(x) = c', description: 'Evaluate f(g(x)) and solve f(x) = c by reading from a graph or solving algebraically.' },
          { title: 'Piecewise-defined and step functions', description: 'Evaluate and graph piecewise functions; check continuity and reason about break points.' },
          { title: 'Function composition and decomposition', description: 'Compose and decompose functions; reason about whether composition is commutative.' },
          { title: 'Inverse functions and the horizontal line test', description: 'Find inverses; verify with f(f⁻¹(x)) = x; apply the horizontal line test.' },
        ],
      },
      {
        title: 'Linear Functions and Modeling',
        description: 'Linear functions in depth, with modeling and arithmetic sequences.',
        lessons: [
          { title: 'Slope, intercepts, and the meaning of each in context', description: 'Compute and interpret slopes and intercepts; reason about units.' },
          { title: 'All three forms of a line and converting between them', description: 'Move fluently between slope-intercept, point-slope, and standard forms.' },
          { title: 'Parallel and perpendicular lines via slope products', description: 'Reason about why perpendicular slopes multiply to −1; write equations from a constraint.' },
          { title: 'Linear inequalities and absolute-value equations and inequalities', description: 'Solve and graph linear and absolute-value inequalities; handle the two-case absolute-value setup.' },
          { title: 'Arithmetic sequences and explicit / recursive forms', description: 'Recognize arithmetic sequences; write explicit aₙ = a₁ + (n−1)d and recursive forms.' },
          { title: 'Modeling word problems with linear and arithmetic-sequence functions', description: 'Build linear and discrete-linear models; interpret in context.' },
          { title: 'Linear regression and goodness of fit', description: 'Compute regression lines using technology; assess fit with residual plots and r-squared at a conceptual level.' },
        ],
      },
      {
        title: 'Systems and Linear Programming',
        description: 'Systems of equations, systems of inequalities, and linear programming optimization.',
        lessons: [
          { title: 'Systems by all three methods with edge cases', description: 'Solve 2x2 systems by graphing, substitution, and elimination; classify all three solution cases.' },
          { title: '3x3 systems by elimination', description: 'Solve 3x3 systems by elimination; recognize inconsistent and dependent cases.' },
          { title: 'Systems of linear inequalities and feasible regions', description: 'Graph systems of inequalities; identify vertices and the feasible region.' },
          { title: 'Linear programming: maximizing and minimizing on a feasible region', description: 'Set up and solve linear programming problems; verify the optimum is at a vertex.' },
          { title: 'Word problems requiring 2x2 or 3x3 systems', description: 'Translate complex word problems into systems; solve and interpret.' },
          { title: 'Matrices preview: solving systems with row reduction', description: 'Apply row reduction to small systems; preview connection to higher math.' },
        ],
      },
      {
        title: 'Exponents, Polynomials, and Factoring',
        description: 'Exponent rules through advanced factoring, including by grouping and synthetic division.',
        lessons: [
          { title: 'Integer and rational exponents and the connection to roots', description: 'Apply exponent rules; interpret a^(1/n) as ⁿ√a and a^(m/n) as (ⁿ√a)ᵐ.' },
          { title: 'Polynomial classification, degree, and end behavior preview', description: 'Classify polynomials; preview end-behavior reasoning by leading-term analysis.' },
          { title: 'Polynomial multiplication and special products', description: 'Multiply polynomials; recognize and expand difference of squares, perfect-square trinomials, and (a+b)³.' },
          { title: 'Factoring trinomials including AC method and grouping', description: 'Factor monic and non-monic trinomials; factor by grouping for four-term polynomials.' },
          { title: 'Difference of cubes and sum of cubes', description: 'Recognize and factor a³ ± b³ using the cubic identities.' },
          { title: 'Synthetic division and the factor theorem', description: 'Apply synthetic division to divide by linear factors; apply the factor theorem to find rational zeros.' },
          { title: 'Solving polynomial equations of degree ≥ 3 by factoring', description: 'Solve cubic and quartic equations using factoring strategies; check for extraneous roots.' },
          { title: 'Polynomial long division', description: 'Divide polynomials by quadratic or higher divisors using long division; interpret remainders.' },
        ],
      },
      {
        title: 'Quadratic Functions and the Quadratic Formula',
        description: 'Quadratics in depth, including completing the square, the discriminant, and complex solutions.',
        lessons: [
          { title: 'Vertex form and standard form: graphing and conversion', description: 'Graph quadratics from each form; convert between forms by completing the square or expansion.' },
          { title: 'Solving quadratics by factoring and the zero-product property', description: 'Apply the zero-product property; reason about why factoring works.' },
          { title: 'Completing the square algebraically and geometrically', description: 'Complete the square algebraically; visualize the geometric interpretation.' },
          { title: 'The quadratic formula and its derivation by completing the square', description: 'Derive the quadratic formula; apply it to numeric and parameter-rich problems.' },
          { title: 'The discriminant and the nature of roots', description: 'Use the discriminant to determine real vs complex roots; relate to the graph.' },
          { title: 'Complex numbers as solutions of quadratics', description: 'Introduce i; solve quadratics with negative discriminant; perform basic complex arithmetic.' },
          { title: 'Modeling with quadratics: projectile, area, and revenue', description: 'Build and interpret quadratic models; identify the meaning of vertex, zeros, and intercepts.' },
          { title: 'Systems containing a quadratic and a linear equation', description: 'Solve systems where one equation is quadratic; interpret the geometry of the intersection.' },
        ],
      },
      {
        title: 'Rational and Radical Expressions',
        description: 'Manipulating, simplifying, and solving with rational and radical expressions.',
        lessons: [
          { title: 'Simplifying rational expressions and finding excluded values', description: 'Reduce rational expressions; identify excluded values from denominators.' },
          { title: 'Multiplying and dividing rational expressions', description: 'Multiply, divide, and simplify rational expressions; verify with restrictions.' },
          { title: 'Adding and subtracting rational expressions with unlike denominators', description: 'Find LCDs; combine rational expressions cleanly.' },
          { title: 'Solving rational equations and checking for extraneous solutions', description: 'Solve rational equations by clearing denominators; check for extraneous solutions caused by domain restrictions.' },
          { title: 'Simplifying radicals and rationalizing denominators', description: 'Simplify radicals using prime factorization; rationalize single-term and binomial denominators.' },
          { title: 'Solving radical equations and checking for extraneous solutions', description: 'Solve square-root and cube-root equations; check for extraneous solutions.' },
        ],
      },
      {
        title: 'Exponential Functions and Logarithm Preview',
        description: 'Exponential growth, decay, and an early introduction to logarithms.',
        lessons: [
          { title: 'Exponential functions y = a·bˣ and graphing', description: 'Graph exponential functions; identify horizontal asymptote and y-intercept.' },
          { title: 'Geometric sequences as discrete exponential functions', description: 'Recognize geometric sequences; write explicit and recursive forms.' },
          { title: 'Exponential growth and decay in real-world contexts', description: 'Model populations, decay, and finance with y = a(1 ± r)ᵗ.' },
          { title: 'Compound interest and the meaning of e (preview)', description: 'Apply A = P(1 + r/n)ⁿᵗ; preview continuous compounding and e.' },
          { title: 'Logarithms as inverse functions and basic log evaluation', description: 'Define log_b(x) as the inverse of bˣ; evaluate clean logs.' },
        ],
      },
      {
        title: 'Sequences and Series',
        description: 'Arithmetic and geometric sequences and series, with applications.',
        lessons: [
          { title: 'Arithmetic sequences: explicit, recursive, and partial sums', description: 'Write arithmetic sequences in both forms; compute partial sums using the average formula.' },
          { title: 'Geometric sequences: explicit, recursive, and partial sums', description: 'Write geometric sequences in both forms; compute partial sums using the closed form.' },
          { title: 'Sigma notation and basic summation', description: 'Translate between sigma notation and expanded sums; evaluate basic sums.' },
          { title: 'Modeling with sequences: savings, loans, growth', description: 'Apply arithmetic and geometric sequences to financial and growth contexts.' },
        ],
      },
      {
        title: 'Statistics, Regression, and Bivariate Data',
        description: 'Descriptive and inferential statistics with bivariate analysis.',
        lessons: [
          { title: 'Center, spread, shape, and outliers', description: 'Compute and interpret all standard statistics; reason about which to use when.' },
          { title: 'Linear, quadratic, and exponential regression', description: 'Fit different models to data; choose the best fit using residuals and context.' },
          { title: 'Correlation, causation, and confounders', description: 'Distinguish correlation from causation; identify possible confounding variables.' },
          { title: 'Two-way tables and conditional probability', description: 'Build two-way tables; compute conditional probabilities and assess independence.' },
          { title: 'Sampling, bias, and the design of an observational study', description: 'Identify biased sampling methods; reason about how design affects what conclusions are valid.' },
        ],
      },
    ],
  },

  {
    slug: 'geometry',
    title: 'PAUSD Geometry',
    description: 'Euclidean geometry at PAUSD rigor: logic, proof, congruence, similarity, circles, coordinate geometry, transformations, and trigonometry foundations.',
    subject: 'math',
    grade: '9',
    difficulty: 'advanced',
    units: [
      {
        title: 'Geometric Foundations and Logic',
        description: 'Points, lines, planes, and the language of geometric proof.',
        lessons: [
          { title: 'Undefined terms, definitions, postulates, and theorems', description: 'Distinguish each; understand why some terms must be undefined and how proofs build on postulates.' },
          { title: 'Points, lines, planes, segments, rays, and angles', description: 'Use proper geometric notation; identify and name geometric objects.' },
          { title: 'Distance and midpoint formulas on the coordinate plane', description: 'Apply the distance and midpoint formulas; reason about why each works.' },
          { title: 'Angle measure, classification, and angle pairs', description: 'Classify angles; identify complementary, supplementary, vertical, and adjacent pairs.' },
          { title: 'Constructions: bisectors and perpendiculars', description: 'Construct angle bisectors, perpendicular bisectors, and perpendiculars from a point.' },
        ],
      },
      {
        title: 'Reasoning and Proof',
        description: 'Inductive and deductive reasoning, conditionals, and the structure of proof.',
        lessons: [
          { title: 'Inductive vs deductive reasoning', description: 'Distinguish the two; recognize the limits of inductive reasoning.' },
          { title: 'Conditional statements: converse, inverse, contrapositive, biconditional', description: 'Write each form; reason about logical equivalence between conditional and contrapositive.' },
          { title: 'Two-column proofs: structure and example', description: 'Read and write two-column proofs; cite reasons for every step.' },
          { title: 'Algebraic proofs and the properties of equality', description: 'Prove algebraic statements with two-column proofs; cite properties of equality at each step.' },
          { title: 'Proofs about angle pairs and segment relationships', description: 'Prove vertical angles congruent, supplementary angles theorem, etc.' },
          { title: 'Indirect proof (proof by contradiction)', description: 'Set up an indirect proof; recognize when contradiction is the cleanest approach.' },
        ],
      },
      {
        title: 'Parallel and Perpendicular Lines',
        description: 'Properties of parallel lines, transversals, and proofs involving them.',
        lessons: [
          { title: 'Parallel lines and angle pairs formed by a transversal', description: 'Identify all eight angles; apply alternate interior, alternate exterior, corresponding, co-interior relationships.' },
          { title: 'Proving lines parallel from angle pair information', description: 'Use converses of angle-pair theorems to prove lines parallel.' },
          { title: 'Perpendicular lines: definition, postulates, and proofs', description: 'Define perpendicularity; prove related theorems.' },
          { title: 'Slopes of parallel and perpendicular lines on the coordinate plane', description: 'Use slope to verify parallelism and perpendicularity.' },
          { title: 'Constructions: parallel and perpendicular lines', description: 'Construct a line parallel to a given line through a point; construct a perpendicular through a point.' },
        ],
      },
      {
        title: 'Triangles and Congruence',
        description: 'Triangle classification, congruence postulates, and triangle proofs.',
        lessons: [
          { title: 'Triangle classification by side and angle', description: 'Classify triangles; reason about which classifications can coexist.' },
          { title: 'Triangle angle-sum and exterior-angle theorems', description: 'Prove and apply both theorems; solve algebraic problems about triangle angles.' },
          { title: 'Congruence postulates: SSS, SAS, ASA, AAS, HL', description: 'Identify which postulates apply; reason about why SSA does not.' },
          { title: 'Two-column congruence proofs', description: 'Prove triangles congruent using all five postulates; cite reasons cleanly.' },
          { title: 'CPCTC and proofs that go beyond congruence', description: 'Use CPCTC after proving triangles congruent to derive corresponding parts.' },
          { title: 'Isosceles and equilateral triangle theorems', description: 'Prove and apply the isosceles triangle theorem and its converse.' },
          { title: 'Triangle inequality and hinge theorem', description: 'Apply the triangle inequality and hinge theorem to compare sides and angles.' },
        ],
      },
      {
        title: 'Similarity',
        description: 'Similar triangles, similarity postulates, and proportions in geometry.',
        lessons: [
          { title: 'Ratios, proportions, and the cross-product property', description: 'Set up and solve proportions; use cross products and reciprocal proportions.' },
          { title: 'AA, SAS, SSS similarity postulates', description: 'Apply similarity postulates; distinguish from congruence postulates.' },
          { title: 'Triangle proportionality theorem and its converse', description: 'Apply the side-splitter theorem and its converse to find unknown lengths.' },
          { title: 'Similar triangles in problem solving and indirect measurement', description: 'Solve problems using similar triangles, including height-of-tree and shadow problems.' },
          { title: 'Proportional perimeters, areas, and volumes', description: 'Apply scale factor k for length, k² for area, k³ for volume in similar figures.' },
          { title: 'Geometric mean and altitude-on-hypotenuse', description: 'Apply the geometric mean theorems for right triangles.' },
        ],
      },
      {
        title: 'Right Triangles and Trigonometry Basics',
        description: 'Pythagorean theorem applications and the basic trigonometric ratios.',
        lessons: [
          { title: 'Pythagorean theorem and its converse', description: 'Apply Pythagoras and its converse; classify triangles as acute, right, or obtuse using sides.' },
          { title: 'Special right triangles: 45-45-90 and 30-60-90', description: 'Derive and apply the special-triangle ratios; rationalize results.' },
          { title: 'Trigonometric ratios: sine, cosine, tangent', description: 'Define ratios in a right triangle; compute exact values for special angles.' },
          { title: 'Solving right triangles for missing sides and angles', description: 'Use sin, cos, tan to find missing parts; apply inverse trig functions for angles.' },
          { title: 'Angles of elevation and depression', description: 'Solve real-world problems involving angles of elevation and depression.' },
          { title: 'Trigonometric problems with multiple right triangles', description: 'Solve problems requiring two or more right-triangle setups.' },
        ],
      },
      {
        title: 'Quadrilaterals and Polygons',
        description: 'Properties of quadrilaterals and polygon angle sums.',
        lessons: [
          { title: 'Polygon angle sums: interior and exterior', description: 'Derive and apply the polygon angle-sum formulas for both interior and exterior angles.' },
          { title: 'Parallelograms: properties and proofs', description: 'Prove and apply parallelogram properties; classify quadrilaterals using these properties.' },
          { title: 'Special parallelograms: rectangle, rhombus, square', description: 'Distinguish and apply properties of each special parallelogram.' },
          { title: 'Trapezoids and kites', description: 'Apply properties of trapezoids and kites; use the midsegment theorem.' },
          { title: 'Coordinate geometry of quadrilaterals', description: 'Classify a quadrilateral on the coordinate plane using slopes and distances.' },
        ],
      },
      {
        title: 'Circles',
        description: 'Circle theorems, central and inscribed angles, and tangent properties.',
        lessons: [
          { title: 'Parts of a circle and basic vocabulary', description: 'Identify radius, diameter, chord, secant, tangent, arc, sector.' },
          { title: 'Central angles, inscribed angles, and arc measures', description: 'Apply theorems relating central, inscribed, and intercepted-arc measures.' },
          { title: 'Tangent lines and tangent-chord angles', description: 'Apply tangent properties; tangent ⟂ radius at point of tangency.' },
          { title: 'Chord-chord, secant-secant, and tangent-secant angle theorems', description: 'Apply each theorem for angles formed by chords, secants, and tangents.' },
          { title: 'Power of a point: chord-chord, tangent-secant, secant-secant', description: 'Apply the power of a point in all three configurations.' },
          { title: 'Equation of a circle in the coordinate plane', description: 'Write and graph circle equations; complete the square to find center and radius.' },
        ],
      },
      {
        title: 'Coordinate Geometry and Transformations',
        description: 'Coordinate proofs and rigid + non-rigid transformations.',
        lessons: [
          { title: 'Coordinate proofs of geometric theorems', description: 'Set up and complete coordinate proofs; choose helpful coordinates.' },
          { title: 'Translations, reflections, rotations', description: 'Apply rigid motions; verify congruence by sequence of motions.' },
          { title: 'Compositions of rigid motions and isometries', description: 'Compose two or three rigid motions; reason about the resulting type of motion.' },
          { title: 'Dilations and similarity transformations', description: 'Apply dilations centered at any point; build similarity transformations.' },
          { title: 'Symmetry: line and rotational symmetry of figures', description: 'Identify all symmetries of polygons and other figures.' },
        ],
      },
      {
        title: 'Area, Surface Area, and Volume',
        description: 'Area and volume of plane figures and three-dimensional solids.',
        lessons: [
          { title: 'Areas of triangles, parallelograms, trapezoids, regular polygons', description: 'Apply area formulas; derive the regular-polygon area formula using apothem.' },
          { title: 'Areas of circles, sectors, and segments', description: 'Compute areas of circles, sectors, and segments using radian or degree measures.' },
          { title: 'Surface area of prisms, cylinders, pyramids, cones', description: 'Compute surface area of each solid; reason about why each formula works.' },
          { title: 'Volume of prisms and cylinders', description: 'Apply V = Bh for prisms and cylinders; solve composite-figure volume problems.' },
          { title: 'Volume of pyramids, cones, and spheres', description: 'Apply V = (1/3)Bh and V = (4/3)πr³; reason about the (1/3) factor.' },
          { title: 'Cross-sections, similarity in 3D, and Cavalieri\'s principle', description: 'Identify cross-sections; apply scaling for similar solids; use Cavalieri\'s principle for unusual shapes.' },
        ],
      },
    ],
  },

  {
    slug: 'geometry-honors',
    title: 'PAUSD Geometry Honors',
    description: 'Honors Euclidean geometry: rigorous proofs, constructions, advanced circle theorems, vectors, loci, 3D geometry, and geometric probability.',
    subject: 'math',
    grade: '9',
    difficulty: 'advanced',
    units: [
      {
        title: 'Axiomatic Systems and Rigorous Proof',
        description: 'A rigorous foundation for Euclidean geometry, including non-Euclidean preview.',
        lessons: [
          { title: 'Euclid\'s axioms and the structure of an axiomatic system', description: 'Examine Euclid\'s five postulates; reason about which axioms are independent.' },
          { title: 'Two-column, paragraph, and flowchart proofs', description: 'Write proofs in all three formats; choose the best format for a given theorem.' },
          { title: 'Proof by contradiction (indirect proof)', description: 'Set up indirect proofs; recognize when contradiction is the cleanest approach.' },
          { title: 'Existence and uniqueness proofs', description: 'Distinguish existence from uniqueness; prove both for selected geometric objects.' },
          { title: 'A taste of non-Euclidean geometry: parallel postulate variants', description: 'Examine spherical and hyperbolic geometry at a conceptual level; reason about implications for the parallel postulate.' },
          { title: 'Logic, truth tables, and quantifiers', description: 'Apply truth tables to compound geometric statements; distinguish ∀ from ∃.' },
        ],
      },
      {
        title: 'Parallel Lines, Transversals, and Angle Theorems',
        description: 'Full proofs of all angle relationships.',
        lessons: [
          { title: 'Angle pair theorems and their proofs', description: 'Prove all eight angle-pair theorems for parallel lines cut by a transversal.' },
          { title: 'Converses and "if and only if" parallelism', description: 'Prove and apply the converse theorems; recognize biconditional structure.' },
          { title: 'Slope criteria for parallel and perpendicular lines (proof)', description: 'Prove that perpendicular slopes multiply to −1 using similar triangles.' },
          { title: 'Concurrent lines and the unique-intersection theorem', description: 'Reason about when three or more lines are concurrent; prove related results.' },
          { title: 'Constructions: parallel and perpendicular lines, with justifications', description: 'Construct and JUSTIFY each construction with a brief proof.' },
        ],
      },
      {
        title: 'Triangle Congruence and Constructions',
        description: 'Full triangle congruence theory plus rigorous constructions.',
        lessons: [
          { title: 'Triangle congruence postulates and their proofs', description: 'Prove SSS, SAS, ASA, AAS, HL; reason about why SSA fails.' },
          { title: 'CPCTC and chains of triangle congruence', description: 'Apply CPCTC; chain multiple triangle congruences in a single proof.' },
          { title: 'Isosceles, equilateral, and right triangle theorems with proofs', description: 'Prove and apply the isosceles triangle theorem, its converse, and equilateral / right-triangle properties.' },
          { title: 'Triangle inequality and hinge theorem (with proofs)', description: 'Prove and apply the triangle inequality and hinge theorem.' },
          { title: 'Concurrency theorems: centroid, circumcenter, incenter, orthocenter', description: 'Define each center; prove its concurrency; locate it for given triangles.' },
          { title: 'Euler line and nine-point circle (preview)', description: 'Examine the Euler line and the nine-point circle at a conceptual level.' },
          { title: 'Constructions: triangle from given parts, including SSA ambiguity', description: 'Construct triangles from given conditions; reason about uniqueness.' },
        ],
      },
      {
        title: 'Similarity, Dilations, and Indirect Measurement',
        description: 'Similarity in depth, with applications to indirect measurement and proportional reasoning.',
        lessons: [
          { title: 'Similarity postulates: AA, SAS, SSS with proofs', description: 'Prove all three similarity postulates; apply to mixed problems.' },
          { title: 'Triangle proportionality theorem and its converse (proofs)', description: 'Prove the side-splitter theorem and its converse.' },
          { title: 'Geometric mean theorems for right triangles', description: 'Prove and apply geometric mean and altitude-on-hypotenuse theorems.' },
          { title: 'Similarity in coordinate geometry and dilations from non-origin centers', description: 'Apply dilations centered at any point; verify similarity in coordinates.' },
          { title: 'Proportional perimeters, areas, and volumes (proof)', description: 'Prove the k, k², k³ scaling for similar figures.' },
          { title: 'Indirect measurement and complex similarity problems', description: 'Solve multi-step similarity problems including those with non-obvious similar triangles.' },
        ],
      },
      {
        title: 'Right Triangles and Special Triangle Trigonometry',
        description: 'Pythagorean theorem, special triangles, and the trigonometric ratios.',
        lessons: [
          { title: 'Pythagorean theorem with multiple proofs', description: 'Examine three different proofs (rearrangement, similar triangle, Garfield\'s).' },
          { title: 'Special right triangles: 45-45-90 and 30-60-90 with derivations', description: 'Derive ratios from first principles; apply to mixed problems.' },
          { title: 'Trigonometric ratios and exact values for special angles', description: 'Define sin, cos, tan; derive exact values for 30°, 45°, 60°.' },
          { title: 'Solving right triangles including angles of elevation and depression', description: 'Solve right triangles; apply to elevation/depression problems with multiple triangles.' },
          { title: 'Law of sines and law of cosines (preview)', description: 'Preview oblique-triangle methods; apply to non-right-triangle problems.' },
          { title: 'Trigonometric identities preview: sin²+cos²=1, complementary angles', description: 'Prove the Pythagorean identity from the unit circle; use complementary-angle identities.' },
        ],
      },
      {
        title: 'Quadrilaterals, Polygons, and Inscribed Figures',
        description: 'Polygon theorems, special quadrilaterals, and inscribed-figure relationships.',
        lessons: [
          { title: 'Polygon angle-sum theorems with proofs (interior and exterior)', description: 'Prove the interior and exterior angle-sum formulas; apply to mixed problems.' },
          { title: 'Parallelogram theorems with proofs', description: 'Prove the parallelogram properties and their converses.' },
          { title: 'Special parallelograms: rectangle, rhombus, square (proofs)', description: 'Prove the additional properties of each special parallelogram.' },
          { title: 'Trapezoids and kites including midsegment theorem (proofs)', description: 'Prove the trapezoid midsegment theorem and kite properties.' },
          { title: 'Inscribed and circumscribed polygons in circles', description: 'Apply theorems for polygons inscribed in or circumscribed about circles; identify central angle relationships.' },
          { title: 'Coordinate proofs of quadrilateral classification', description: 'Use coordinate geometry to classify quadrilaterals; choose helpful coordinates.' },
        ],
      },
      {
        title: 'Circles, Tangents, and Arc Theorems',
        description: 'A full circle-theorem unit including power of a point.',
        lessons: [
          { title: 'Central, inscribed, and intercepted-arc theorems with proofs', description: 'Prove the inscribed angle theorem; apply to mixed problems.' },
          { title: 'Tangent properties: tangent ⟂ radius, two-tangent theorem', description: 'Prove tangent properties; apply to multi-circle problems.' },
          { title: 'Chord-chord, secant-secant, tangent-secant angle theorems', description: 'Apply theorems for angles formed by chords, secants, and tangents inside, on, and outside the circle.' },
          { title: 'Power of a point in all three configurations', description: 'Prove and apply the power of a point in all three cases.' },
          { title: 'Equation of a circle and completing the square', description: 'Write and graph circle equations; complete the square to find center and radius.' },
          { title: 'Inscribed and circumscribed quadrilaterals in circles', description: 'Apply opposite-angle theorems for cyclic quadrilaterals; recognize Ptolemy\'s theorem (preview).' },
          { title: 'Arc length and sector area in radians', description: 'Convert between degree and radian measure; apply arc-length and sector-area formulas in radians.' },
        ],
      },
      {
        title: 'Coordinate Geometry, Vectors, and Loci',
        description: 'Coordinate proofs, an introduction to vectors, and locus problems.',
        lessons: [
          { title: 'Coordinate proofs of geometric theorems', description: 'Choose strategic coordinates; complete coordinate proofs of major theorems.' },
          { title: 'Vectors: magnitude, direction, addition, scalar multiplication', description: 'Define vectors; perform vector addition and scalar multiplication geometrically and algebraically.' },
          { title: 'Vector applications: forces, displacements, geometry proofs', description: 'Apply vectors to solve geometry problems; preview dot-product reasoning.' },
          { title: 'Loci and the locus definition of conic sections', description: 'Define and find loci satisfying a given condition; preview the conic sections as loci.' },
          { title: 'Equations of parabolas, ellipses, hyperbolas (preview)', description: 'Preview conic-section equations from their locus definitions.' },
          { title: 'Parametric equations of a line', description: 'Parameterize a line; reason about parameter as time.' },
        ],
      },
      {
        title: 'Transformations, Symmetry, and Tessellations',
        description: 'Transformations as functions, group structure, and tessellations.',
        lessons: [
          { title: 'Rigid motions as functions on the plane', description: 'Define each transformation as a function; reason about the function\'s properties.' },
          { title: 'Compositions and the group structure of isometries', description: 'Compose isometries; preview the group structure of plane motions.' },
          { title: 'Symmetry groups of polygons', description: 'Identify the symmetry group of each regular polygon; reason about cyclic vs dihedral structure.' },
          { title: 'Tessellations: regular, semi-regular, and Escher-style', description: 'Identify and create tessellations; reason about which polygons tessellate.' },
          { title: 'Glide reflections and the classification of plane isometries', description: 'Define glide reflections; classify all four types of plane isometries.' },
        ],
      },
      {
        title: '3D Geometry and Cross-Sections',
        description: 'Three-dimensional figures, cross-sections, and Cavalieri\'s principle.',
        lessons: [
          { title: 'Surface area of prisms, cylinders, pyramids, cones, spheres (proofs)', description: 'Derive each surface area formula; apply to composite figures.' },
          { title: 'Volume of prisms, cylinders, pyramids, cones, spheres', description: 'Apply each volume formula; reason about why the (1/3) factor appears for pyramids and cones.' },
          { title: 'Cavalieri\'s principle and its applications', description: 'State and apply Cavalieri\'s principle; use it to derive sphere volume.' },
          { title: 'Cross-sections of common 3D solids', description: 'Identify cross-sections of prisms, pyramids, cylinders, cones, and spheres.' },
          { title: 'Similar solids and the k³ volume rule', description: 'Apply the k, k², k³ scaling rules to similar 3D solids; solve mixed problems.' },
        ],
      },
      {
        title: 'Probability and Geometric Probability',
        description: 'Probability theory and geometric probability via areas and lengths.',
        lessons: [
          { title: 'Probability as length, area, and volume ratios', description: 'Compute geometric probabilities using length, area, or volume ratios.' },
          { title: 'Conditional probability and independence in geometric setups', description: 'Compute conditional probabilities for geometric events.' },
          { title: 'Expected value with geometric setups', description: 'Compute expected value for problems involving geometric probability.' },
          { title: 'Buffon\'s needle and Monte Carlo estimation (preview)', description: 'Examine Buffon\'s needle problem; preview Monte Carlo methods for geometric probabilities.' },
        ],
      },
    ],
  },

  // =====================================================================
  // SCIENCE — 6th, 7th, 8th
  // =====================================================================
  {
    slug: 'science-6-earth',
    title: 'PAUSD 6th Grade Science: Earth & Space',
    description: 'NGSS-aligned 6th grade integrated science (CA Integrated 1): plate tectonics, rocks, weathering, weather, climate, the solar system, and engineering design.',
    subject: 'science',
    grade: '6',
    difficulty: 'advanced',
    units: [
      {
        title: 'Earth\'s Interior and Plate Tectonics',
        description: 'The structure of Earth\'s interior and the mechanics of plate tectonics.',
        lessons: [
          { title: 'Layers of the Earth: composition vs mechanical layers', description: 'Distinguish crust/mantle/core (composition) from lithosphere/asthenosphere/mesosphere (mechanical); reason about what evidence supports each model.' },
          { title: 'Evidence for continental drift and the development of plate tectonics', description: 'Trace the historical evidence (fossils, fit of continents, mid-ocean ridges); reason about the strength of each line of evidence.' },
          { title: 'Plate boundaries: convergent, divergent, transform', description: 'Identify each boundary type; predict the geologic features each produces.' },
          { title: 'Volcanoes, earthquakes, and mountain building at boundaries', description: 'Connect specific geologic events to specific plate-boundary types; explain the mechanism in each case.' },
          { title: 'Hotspots, intraplate volcanism, and the age progression of island chains', description: 'Explain Hawaiian and Yellowstone-style hotspots; reason about why island chains show age progression.' },
          { title: 'Seafloor spreading and magnetic reversals', description: 'Explain how magnetic reversals frozen in seafloor basalt support plate tectonics.' },
        ],
      },
      {
        title: 'Rocks, Minerals, and the Rock Cycle',
        description: 'Rock and mineral identification and the cyclic transformations between rock types.',
        lessons: [
          { title: 'Minerals: definition, properties, and the Mohs scale', description: 'Identify minerals using crystal form, hardness, cleavage, streak, luster.' },
          { title: 'Igneous rocks: intrusive vs extrusive, mafic vs felsic', description: 'Classify igneous rocks; reason about formation conditions from texture and composition.' },
          { title: 'Sedimentary rocks: clastic, chemical, biochemical', description: 'Classify sedimentary rocks; interpret depositional environment from rock features.' },
          { title: 'Metamorphic rocks: foliated vs non-foliated and protolith reasoning', description: 'Classify metamorphic rocks; reason backwards from a metamorphic rock to its likely protolith.' },
          { title: 'The rock cycle and energy flow through Earth\'s systems', description: 'Trace a rock through multiple cycles; reason about the energy sources driving each transformation.' },
        ],
      },
      {
        title: 'Weathering, Erosion, and Deposition',
        description: 'Surface processes that shape the landscape.',
        lessons: [
          { title: 'Mechanical and chemical weathering processes', description: 'Distinguish mechanical from chemical weathering; identify which processes dominate in which climates.' },
          { title: 'Soil formation and soil horizons', description: 'Connect parent rock and weathering to soil composition; identify horizons in a soil profile.' },
          { title: 'Erosion by water, wind, ice, and gravity', description: 'Identify the dominant erosional agent in different environments; reason about characteristic landforms.' },
          { title: 'Deposition and the formation of sedimentary landforms', description: 'Connect erosional energy to grain size deposited; identify deltas, alluvial fans, and dunes.' },
          { title: 'Coastal and river systems as long-term shapers of the surface', description: 'Trace a sediment grain from mountain to delta; reason about how coastal and river systems evolve.' },
        ],
      },
      {
        title: 'Weather, Climate, and Atmospheric Systems',
        description: 'Atmospheric structure, weather phenomena, and global climate patterns.',
        lessons: [
          { title: 'Layers of the atmosphere and temperature profile', description: 'Identify atmospheric layers; reason about why temperature behaves as it does in each layer.' },
          { title: 'Energy from the sun and the greenhouse effect', description: 'Trace incoming solar radiation; explain how greenhouse gases trap outgoing infrared radiation.' },
          { title: 'Air pressure, wind, and the Coriolis effect', description: 'Connect pressure differences to wind; explain how the Coriolis effect deflects winds.' },
          { title: 'Global wind patterns and ocean currents', description: 'Map the major wind belts and ocean currents; connect them to climate zones.' },
          { title: 'Air masses, fronts, and storm formation', description: 'Identify air mass types; predict weather changes when fronts pass.' },
          { title: 'Severe weather: thunderstorms, tornadoes, hurricanes', description: 'Explain the formation mechanism for each; reason about what conditions favor each type.' },
          { title: 'Climate vs weather and long-term climate drivers', description: 'Distinguish climate from weather; identify the major drivers of long-term climate change.' },
        ],
      },
      {
        title: 'The Solar System and Beyond',
        description: 'Earth-Sun-Moon system, planets, and the structure of the universe.',
        lessons: [
          { title: 'Earth-Sun-Moon system: seasons, phases, eclipses', description: 'Explain seasons from axial tilt; predict moon phases and eclipse types.' },
          { title: 'Planetary motion: orbits, Kepler\'s laws (qualitative)', description: 'Describe planetary orbits; state Kepler\'s laws qualitatively.' },
          { title: 'Inner vs outer planets and their characteristics', description: 'Compare terrestrial and Jovian planets; reason about why they differ.' },
          { title: 'Other solar system objects: dwarf planets, moons, asteroids, comets', description: 'Classify solar system objects; reason about their formation and composition.' },
          { title: 'Stars: classification, life cycle, and the Hertzsprung-Russell diagram', description: 'Classify stars by mass; trace the stellar life cycle; read the H-R diagram.' },
          { title: 'Galaxies and the structure of the universe', description: 'Classify galaxies; describe the large-scale structure of the universe.' },
          { title: 'The Big Bang theory and evidence for it', description: 'State the Big Bang theory; evaluate the evidence (cosmic microwave background, redshift, abundance of light elements).' },
        ],
      },
      {
        title: 'Ecosystems and the Cycling of Matter',
        description: 'Energy flow and matter cycling through Earth systems.',
        lessons: [
          { title: 'Energy flow through ecosystems: producers, consumers, decomposers', description: 'Trace energy from sun to apex predators; reason about why energy is lost at each trophic level.' },
          { title: 'The water cycle: evaporation, condensation, precipitation', description: 'Trace water through the cycle; identify the role of each process.' },
          { title: 'The carbon cycle: photosynthesis, respiration, combustion, decomposition', description: 'Trace carbon through the cycle; identify how human activity disrupts it.' },
          { title: 'The nitrogen cycle: fixation, nitrification, denitrification', description: 'Trace nitrogen through the cycle; explain why nitrogen is often a limiting nutrient.' },
          { title: 'Human impact on biogeochemical cycles', description: 'Identify how humans disrupt the carbon, nitrogen, and water cycles; reason about consequences.' },
        ],
      },
      {
        title: 'Engineering Design and Earth Systems',
        description: 'The engineering design process applied to Earth-systems problems.',
        lessons: [
          { title: 'The engineering design process: define, develop, optimize', description: 'Apply the engineering design process to a problem; reason about iteration.' },
          { title: 'Designing solutions for natural-hazard mitigation', description: 'Design earthquake, flood, or wildfire mitigation solutions; evaluate trade-offs.' },
          { title: 'Renewable energy systems: solar, wind, hydro, geothermal', description: 'Compare renewable energy systems; reason about strengths and limitations of each.' },
          { title: 'Sustainability and the design of human systems', description: 'Define sustainability; evaluate human systems against sustainability criteria.' },
        ],
      },
    ],
  },

  {
    slug: 'science-7-life',
    title: 'PAUSD 7th Grade Science: Life Science',
    description: 'NGSS-aligned 7th grade life science (CA Integrated 2): cells, energy, body systems, genetics, evolution, ecology, and human impact.',
    subject: 'science',
    grade: '7',
    difficulty: 'advanced',
    units: [
      {
        title: 'Cells: Structure, Function, and Theory',
        description: 'Cell theory and the structure-function relationships in cells.',
        lessons: [
          { title: 'Cell theory and the development of microscopy', description: 'State cell theory; trace the historical development; reason about how new technology enabled new discoveries.' },
          { title: 'Prokaryotic vs eukaryotic cells', description: 'Distinguish prokaryotic from eukaryotic cells; reason about evolutionary implications.' },
          { title: 'Plant vs animal cells and their organelles', description: 'Compare plant and animal cell structures; connect each organelle to its function.' },
          { title: 'Cell membrane structure and the fluid mosaic model', description: 'Describe membrane structure; explain how the fluid mosaic model accounts for membrane behavior.' },
          { title: 'Diffusion, osmosis, and active transport', description: 'Distinguish passive and active transport; predict water and solute movement across membranes.' },
          { title: 'Cell division: mitosis and the cell cycle', description: 'Trace the cell cycle; identify what happens at each phase of mitosis.' },
        ],
      },
      {
        title: 'Photosynthesis and Cellular Respiration',
        description: 'Energy capture, energy release, and the relationship between the two.',
        lessons: [
          { title: 'Photosynthesis overview and chemical equation', description: 'Write and balance the photosynthesis equation; identify reactants and products.' },
          { title: 'Light-dependent reactions and the role of chlorophyll', description: 'Describe the light-dependent reactions at a conceptual level; explain why plants are green.' },
          { title: 'Calvin cycle and carbon fixation', description: 'Trace carbon through the Calvin cycle; reason about why CO₂ is the source of plant biomass.' },
          { title: 'Cellular respiration overview and chemical equation', description: 'Write and balance the respiration equation; relate to photosynthesis.' },
          { title: 'Aerobic vs anaerobic respiration', description: 'Distinguish aerobic from anaerobic respiration; reason about energy yield in each case.' },
        ],
      },
      {
        title: 'Body Systems and Homeostasis',
        description: 'Human body systems and how they cooperate to maintain homeostasis.',
        lessons: [
          { title: 'Levels of organization: cells, tissues, organs, systems', description: 'Trace levels of organization; connect each level to its emergent properties.' },
          { title: 'Digestive system: mechanical and chemical digestion', description: 'Trace food through the digestive tract; identify chemical digestion at each step.' },
          { title: 'Circulatory system: heart, blood vessels, blood', description: 'Trace blood through the heart and circulation; connect blood components to their functions.' },
          { title: 'Respiratory system and gas exchange', description: 'Trace air through the respiratory system; explain gas exchange at the alveoli.' },
          { title: 'Nervous system: neurons, brain, and reflex arcs', description: 'Describe neuron structure; trace a reflex arc; identify major brain regions.' },
          { title: 'Endocrine system: hormones and feedback loops', description: 'Identify major endocrine glands; describe a negative feedback loop with a specific hormone.' },
          { title: 'Excretory and immune systems', description: 'Trace waste through the excretory system; describe innate vs adaptive immunity.' },
          { title: 'Homeostasis and integrated body responses', description: 'Trace the integrated response of multiple body systems to a homeostatic challenge (e.g., exercise, fever).' },
        ],
      },
      {
        title: 'Genetics and Heredity',
        description: 'Mendelian genetics, DNA, and modern genetics.',
        lessons: [
          { title: 'Mendel\'s laws: segregation and independent assortment', description: 'State Mendel\'s laws; reason about why each law works.' },
          { title: 'Punnett squares: monohybrid and dihybrid crosses', description: 'Set up and solve monohybrid and dihybrid crosses; predict phenotypic and genotypic ratios.' },
          { title: 'Non-Mendelian inheritance: codominance, incomplete dominance, sex linkage', description: 'Identify each pattern from a pedigree or cross; predict ratios.' },
          { title: 'DNA structure: double helix, base pairing, antiparallel strands', description: 'Describe DNA structure; reason about why base pairing is specific.' },
          { title: 'DNA replication and the cell cycle', description: 'Trace DNA replication; identify the role of key enzymes.' },
          { title: 'Transcription, translation, and the genetic code', description: 'Trace gene expression from DNA to protein; use a codon chart to translate.' },
          { title: 'Mutations and their effects on proteins', description: 'Classify mutations; predict the effect on the protein product.' },
        ],
      },
      {
        title: 'Natural Selection and Evolution',
        description: 'The mechanisms and evidence of evolution.',
        lessons: [
          { title: 'Variation, selection, and Darwin\'s mechanism of natural selection', description: 'Explain Darwin\'s four conditions; identify each in a real example.' },
          { title: 'Evidence for evolution: fossil record, anatomy, molecular biology', description: 'Evaluate each line of evidence; reason about the strength of each.' },
          { title: 'Speciation: allopatric, sympatric, and reproductive isolation', description: 'Distinguish modes of speciation; identify reproductive isolation mechanisms.' },
          { title: 'Adaptive radiation and convergent vs divergent evolution', description: 'Distinguish convergent from divergent evolution; identify adaptive radiation in real examples.' },
          { title: 'Phylogeny and tree-thinking', description: 'Read phylogenetic trees; reason about which traits are shared by descent vs convergent.' },
          { title: 'Human evolution and the hominid record', description: 'Trace key transitions in hominid evolution; evaluate the evidence for each.' },
        ],
      },
      {
        title: 'Ecology, Populations, and Biodiversity',
        description: 'Population dynamics, community interactions, and biodiversity.',
        lessons: [
          { title: 'Levels of ecological organization: individual to biosphere', description: 'Distinguish levels; identify the unit of analysis at each level.' },
          { title: 'Population dynamics: growth models and carrying capacity', description: 'Distinguish exponential from logistic growth; reason about what limits populations.' },
          { title: 'Community interactions: competition, predation, symbiosis', description: 'Identify each interaction type; predict population effects.' },
          { title: 'Energy flow and food webs', description: 'Build food webs; reason about why energy is lost at each trophic level.' },
          { title: 'Biomes and their defining characteristics', description: 'Identify major biomes; connect climate to biome.' },
          { title: 'Biodiversity, ecosystem services, and conservation', description: 'Define biodiversity; identify ecosystem services; evaluate conservation strategies.' },
        ],
      },
      {
        title: 'Human Impact and Environmental Science',
        description: 'How human activities affect ecosystems and the planet.',
        lessons: [
          { title: 'Human impact on biogeochemical cycles', description: 'Identify how humans disrupt the carbon, nitrogen, and water cycles; reason about consequences.' },
          { title: 'Climate change: causes, evidence, and effects', description: 'Distinguish weather from climate; evaluate evidence for anthropogenic climate change.' },
          { title: 'Pollution: air, water, soil, and noise', description: 'Identify pollution sources; reason about which control strategies are most effective.' },
          { title: 'Sustainability and conservation strategies', description: 'Define sustainability; evaluate conservation strategies on multiple criteria.' },
        ],
      },
    ],
  },

  {
    slug: 'science-8-physical',
    title: 'PAUSD 8th Grade Science: Physical Science',
    description: 'NGSS-aligned 8th grade physical science (CA Integrated 3): atoms, chemical reactions, forces, energy, waves, and electricity & magnetism.',
    subject: 'science',
    grade: '8',
    difficulty: 'advanced',
    units: [
      {
        title: 'Atomic Structure and the Periodic Table',
        description: 'The structure of atoms and the organization of the periodic table.',
        lessons: [
          { title: 'Historical models of the atom: Dalton, Thomson, Rutherford, Bohr', description: 'Trace the historical models; reason about which experiments motivated each model.' },
          { title: 'Subatomic particles: protons, neutrons, electrons', description: 'Describe each particle; reason about charge, mass, and location.' },
          { title: 'Atomic number, mass number, and isotopes', description: 'Compute atomic number and mass number; identify isotopes from atomic notation.' },
          { title: 'Electron configuration and energy levels', description: 'Write electron configurations for elements 1-20; reason about valence electrons.' },
          { title: 'Periodic table organization: groups, periods, blocks', description: 'Identify periodic trends; predict properties from position on the table.' },
          { title: 'Periodic trends: atomic radius, ionization energy, electronegativity', description: 'Predict and explain trends; reason about the underlying causes.' },
        ],
      },
      {
        title: 'Chemical Bonding and Reactions',
        description: 'How atoms bond and how matter rearranges in chemical reactions.',
        lessons: [
          { title: 'Ionic bonding and the formation of ionic compounds', description: 'Predict ionic bonding from electron configuration; write formulas for ionic compounds.' },
          { title: 'Covalent bonding and molecular compounds', description: 'Distinguish ionic from covalent bonding; predict molecular geometry for simple cases.' },
          { title: 'Naming compounds: ionic and covalent', description: 'Apply IUPAC naming rules to ionic and simple covalent compounds.' },
          { title: 'Chemical equations: balancing and conservation of mass', description: 'Balance chemical equations; verify conservation of mass.' },
          { title: 'Types of chemical reactions: synthesis, decomposition, replacement, combustion', description: 'Classify reactions; predict products for each reaction type.' },
          { title: 'Reaction rate and factors affecting it', description: 'Identify factors affecting reaction rate; reason about the underlying mechanism.' },
          { title: 'Acids, bases, and the pH scale', description: 'Define acids and bases; interpret the pH scale; predict products of acid-base reactions.' },
        ],
      },
      {
        title: 'Forces, Motion, and Newton\'s Laws',
        description: 'Kinematics, forces, and Newton\'s three laws.',
        lessons: [
          { title: 'Distance, displacement, speed, velocity, acceleration', description: 'Distinguish each quantity; compute each from a position vs time graph.' },
          { title: 'Kinematics graphs: position, velocity, acceleration vs time', description: 'Interpret motion graphs; sketch each from the others.' },
          { title: 'Newton\'s first law and inertia', description: 'State Newton\'s first law; identify inertia in real examples.' },
          { title: 'Newton\'s second law: F = ma', description: 'Apply F = ma to compute force, mass, or acceleration; reason about units.' },
          { title: 'Newton\'s third law and action-reaction pairs', description: 'Identify action-reaction pairs; reason about why they don\'t cancel.' },
          { title: 'Friction, gravity, and normal force', description: 'Identify each force; apply free-body diagrams to simple problems.' },
          { title: 'Momentum, impulse, and conservation of momentum', description: 'Define momentum and impulse; apply conservation of momentum to collisions.' },
        ],
      },
      {
        title: 'Energy, Work, and Power',
        description: 'Forms of energy, energy transformations, and conservation of energy.',
        lessons: [
          { title: 'Forms of energy: kinetic, potential, thermal, chemical, nuclear', description: 'Identify forms of energy in real systems; trace energy transformations.' },
          { title: 'Work and the work-energy theorem', description: 'Compute work; relate work to change in kinetic energy.' },
          { title: 'Conservation of energy', description: 'Apply conservation of energy to mechanical systems including pendulums and roller coasters.' },
          { title: 'Power: work per unit time and energy per unit time', description: 'Compute power; reason about units and real-world applications.' },
          { title: 'Heat transfer: conduction, convection, radiation', description: 'Identify each mode of heat transfer; reason about which dominates in different situations.' },
        ],
      },
      {
        title: 'Waves: Sound and Light',
        description: 'Wave properties, sound, and the electromagnetic spectrum.',
        lessons: [
          { title: 'Wave properties: amplitude, wavelength, frequency, speed', description: 'Define each property; relate them via v = fλ.' },
          { title: 'Transverse and longitudinal waves', description: 'Distinguish transverse from longitudinal; identify examples of each.' },
          { title: 'Sound waves and the Doppler effect', description: 'Describe sound as a longitudinal wave; explain the Doppler effect with examples.' },
          { title: 'The electromagnetic spectrum', description: 'Identify regions of the EM spectrum; reason about wavelength, frequency, and energy relationships.' },
          { title: 'Reflection, refraction, and lens / mirror behavior', description: 'Apply reflection and refraction laws; trace rays through simple lenses and mirrors.' },
          { title: 'Wave interference and the superposition principle', description: 'Apply superposition; identify constructive and destructive interference.' },
        ],
      },
      {
        title: 'Electricity and Magnetism',
        description: 'Electric charge, circuits, magnetism, and their unification.',
        lessons: [
          { title: 'Electric charge, conductors, and insulators', description: 'Distinguish conductors from insulators; explain charging by friction, contact, and induction.' },
          { title: 'Coulomb\'s law (qualitative) and electric fields', description: 'Apply Coulomb\'s law qualitatively; describe electric fields from point charges.' },
          { title: 'Electric current, voltage, resistance, and Ohm\'s law', description: 'Apply Ohm\'s law to simple circuits; reason about units.' },
          { title: 'Series and parallel circuits', description: 'Compute equivalent resistance and current in series and parallel circuits.' },
          { title: 'Magnetism, magnetic fields, and Earth\'s magnetic field', description: 'Describe magnetic fields; explain Earth\'s field and its origin.' },
          { title: 'Electromagnetism: how moving charges create magnetic fields', description: 'Connect electricity and magnetism; describe how electromagnets and motors work.' },
        ],
      },
      {
        title: 'Engineering Design and Design Challenges',
        description: 'Apply physical science to engineering design challenges.',
        lessons: [
          { title: 'The engineering design process applied to physical-science problems', description: 'Apply define-develop-optimize to a physical-science problem.' },
          { title: 'Designing for energy efficiency', description: 'Design and evaluate solutions to reduce energy use; reason about trade-offs.' },
          { title: 'Designing solutions for impact protection (collisions, drops)', description: 'Apply momentum and impulse to design impact-absorbing solutions.' },
          { title: 'Designing simple machines: levers, pulleys, gears', description: 'Apply force and energy concepts to simple machines; reason about mechanical advantage.' },
        ],
      },
    ],
  },
];

// Helper: get a single template by slug.
export function getPausdTemplate(slug) {
  return PAUSD_CATALOG.find(c => c.slug === slug) || null;
}

// Helper: list summary cards for the catalog UI (slug, title, description,
// subject, grade, difficulty, unit count, lesson count).
export function listPausdCatalog() {
  return PAUSD_CATALOG.map(c => ({
    slug: c.slug,
    title: c.title,
    description: c.description,
    subject: c.subject,
    grade: c.grade,
    difficulty: c.difficulty,
    unitCount: (c.units || []).length,
    lessonCount: (c.units || []).reduce((n, u) => n + (u.lessons || []).length, 0),
  }));
}
