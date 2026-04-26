// PAUSD Common Core curriculum catalog. Each math course mirrors the
// chapter-and-section structure of the Big Ideas Math textbook PAUSD
// has actually adopted (verified against PAUSD parents2parents math
// advisory + paloaltoonline.com 2017 adoption coverage):
//
//   - Foundations in Math       Big Ideas Math Modeling Real Life Grade 6 (green)
//   - Concepts in Math          Big Ideas Math Modeling Real Life Course 2 Accelerated (red)
//   - Algebra 1                 Big Ideas Math Algebra 1: A Common Core Curriculum (blue/gold)
//   - Geometry H                Big Ideas Math Geometry: A Common Core Curriculum (honors enrichment layered on top)
//
// Lesson titles mirror Big Ideas Math section titles (e.g. "1.2 Solving
// Multi-Step Equations") so the catalog tracks the textbook 1:1. The
// AI lesson chat takes those titles + the COURSE MEMORY block and
// teaches each lesson at PAUSD-honors rigor. Science courses follow
// the NGSS California Integrated 1/2/3 sequence.

export const PAUSD_CATALOG = [
  // =====================================================================
  // MATH — PAUSD's actual course names + actual textbook structure
  // =====================================================================

  {
    slug: 'foundations-in-math',
    title: 'PAUSD Foundations in Math',
    description: 'PAUSD 6th-grade math (Foundations in Math), aligned to Big Ideas Math: Modeling Real Life Grade 6 (green textbook). Honors-tier depth on every chapter.',
    subject: 'math',
    grade: '6',
    difficulty: 'advanced',
    textbook: 'Big Ideas Math: Modeling Real Life — Grade 6',
    units: [
      {
        title: 'Ch 1 — Numerical Expressions and Factors',
        description: 'Powers, order of operations, prime factorization, GCF, LCM.',
        lessons: [
          { title: '1.1 Powers and Exponents', description: 'Write and evaluate powers; apply order of operations to expressions with exponents.' },
          { title: '1.2 Order of Operations', description: 'Evaluate multi-step numeric expressions including powers and grouping symbols.' },
          { title: '1.3 Prime Factorization', description: 'Find the prime factorization of whole numbers using factor trees and division.' },
          { title: '1.4 Greatest Common Factor', description: 'Find the GCF of two or more numbers; apply to simplification problems.' },
          { title: '1.5 Least Common Multiple', description: 'Find the LCM of two or more numbers; choose between GCF and LCM in word problems.' },
        ],
      },
      {
        title: 'Ch 2 — Fractions and Decimals',
        description: 'Operations with fractions and multi-digit decimals.',
        lessons: [
          { title: '2.1 Multiplying Fractions', description: 'Multiply fractions and mixed numbers; simplify before multiplying.' },
          { title: '2.2 Dividing Fractions', description: 'Divide a fraction by a fraction; interpret the result in context.' },
          { title: '2.3 Dividing Mixed Numbers', description: 'Divide mixed numbers by converting to improper fractions.' },
          { title: '2.4 Adding and Subtracting Decimals', description: 'Add and subtract multi-digit decimals with full precision.' },
          { title: '2.5 Multiplying Decimals', description: 'Multiply multi-digit decimals; reason about decimal-place placement.' },
          { title: '2.6 Dividing Whole Numbers and Decimals', description: 'Divide multi-digit numbers and decimals using the standard algorithm.' },
        ],
      },
      {
        title: 'Ch 3 — Algebraic Expressions and Properties',
        description: 'Building, evaluating, and simplifying algebraic expressions.',
        lessons: [
          { title: '3.1 Algebraic Expressions', description: 'Translate words to algebraic expressions; identify terms, coefficients, constants.' },
          { title: '3.2 Writing Expressions', description: 'Write algebraic expressions for verbal phrases including "less than" and "the quantity".' },
          { title: '3.3 Properties of Addition and Multiplication', description: 'Apply commutative, associative, and identity properties to simplify.' },
          { title: '3.4 The Distributive Property', description: 'Apply the distributive property forwards and backwards.' },
          { title: '3.5 Factoring Expressions', description: 'Factor out a common factor from an algebraic expression.' },
        ],
      },
      {
        title: 'Ch 4 — Areas of Polygons',
        description: 'Area of triangles, parallelograms, trapezoids, composite figures, and polygons on the coordinate plane.',
        lessons: [
          { title: '4.1 Areas of Parallelograms', description: 'Derive and apply the parallelogram area formula by decomposing into a rectangle.' },
          { title: '4.2 Areas of Triangles', description: 'Derive and apply the triangle area formula; choose the right base/height pair.' },
          { title: '4.3 Areas of Trapezoids and Kites', description: 'Apply trapezoid and kite area formulas to mixed problems.' },
          { title: '4.4 Three-Dimensional Figures and Composite Figures', description: 'Compute areas of composite figures by decomposition and subtraction.' },
          { title: '4.5 Polygons in the Coordinate Plane', description: 'Compute side lengths, perimeters, and areas of polygons given by coordinates.' },
        ],
      },
      {
        title: 'Ch 5 — Ratios and Rates',
        description: 'Ratios, rates, ratio tables, and percent.',
        lessons: [
          { title: '5.1 Ratios', description: 'Write ratios in three forms; identify equivalent ratios.' },
          { title: '5.2 Ratio Tables', description: 'Use ratio tables to find equivalent ratios and solve problems.' },
          { title: '5.3 Rates and Unit Rates', description: 'Compute unit rates including with fractional numerators and denominators.' },
          { title: '5.4 Comparing and Graphing Ratios', description: 'Compare ratios using tables and graphs; interpret the meaning of points.' },
          { title: '5.5 Percents', description: 'Translate between percent, decimal, fraction; solve "X% of Y" problems.' },
          { title: '5.6 Solving Percent Problems', description: 'Solve percent-of-a-whole, finding-a-part, and finding-the-whole problems.' },
          { title: '5.7 Converting Measures', description: 'Convert between units using ratios; chain multi-step conversions.' },
        ],
      },
      {
        title: 'Ch 6 — Integers and the Coordinate Plane',
        description: 'Integers, absolute value, rational numbers, and the four-quadrant coordinate plane.',
        lessons: [
          { title: '6.1 Integers', description: 'Use integers to represent quantities; identify opposites.' },
          { title: '6.2 Comparing and Ordering Integers', description: 'Compare and order integers on a number line.' },
          { title: '6.3 Fractions and Decimals on the Number Line', description: 'Plot and order rational numbers on a number line.' },
          { title: '6.4 Absolute Value', description: 'Define absolute value as distance from zero; solve |x| = a.' },
          { title: '6.5 The Coordinate Plane', description: 'Plot points in all four quadrants; reflect points across axes.' },
        ],
      },
      {
        title: 'Ch 7 — Equations and Inequalities',
        description: 'One-variable equations and inequalities and their graphs.',
        lessons: [
          { title: '7.1 Writing Equations in One Variable', description: 'Translate verbal sentences into equations; check solutions by substitution.' },
          { title: '7.2 Solving Equations Using Addition or Subtraction', description: 'Solve x ± a = b equations; verify by substitution.' },
          { title: '7.3 Solving Equations Using Multiplication or Division', description: 'Solve ax = b equations including fractional and negative coefficients.' },
          { title: '7.4 Writing Equations in Two Variables', description: 'Identify dependent and independent variables; write equations from tables and graphs.' },
          { title: '7.5 Writing and Graphing Inequalities', description: 'Write inequalities for verbal statements; graph on a number line.' },
          { title: '7.6 Solving Inequalities Using Addition or Subtraction', description: 'Solve x ± a < b and similar; graph the solution.' },
          { title: '7.7 Solving Inequalities Using Multiplication or Division', description: 'Solve ax < b including the sign-flip when multiplying by a negative.' },
        ],
      },
      {
        title: 'Ch 8 — Surface Area and Volume',
        description: 'Surface area of prisms and pyramids; volume of rectangular prisms with fractional edges.',
        lessons: [
          { title: '8.1 Three-Dimensional Figures', description: 'Identify prisms, pyramids, cylinders, cones, and spheres; describe cross-sections.' },
          { title: '8.2 Surface Areas of Prisms', description: 'Compute surface area of right prisms using nets.' },
          { title: '8.3 Surface Areas of Pyramids', description: 'Compute surface area of regular pyramids using nets.' },
          { title: '8.4 Volumes of Rectangular Prisms', description: 'Compute volumes including with fractional edges; reason about V = lwh.' },
        ],
      },
      {
        title: 'Ch 9 — Statistical Measures',
        description: 'Statistical questions, measures of center and variation, and outliers.',
        lessons: [
          { title: '9.1 Introduction to Statistics', description: 'Distinguish statistical from non-statistical questions.' },
          { title: '9.2 Mean', description: 'Compute and interpret the mean; reason about its sensitivity to outliers.' },
          { title: '9.3 Measures of Center', description: 'Compute median and mode; choose the appropriate center for a distribution.' },
          { title: '9.4 Measures of Variation', description: 'Compute range, IQR, and mean absolute deviation.' },
          { title: '9.5 Mean Absolute Deviation', description: 'Compute MAD; compare two distributions using both center and MAD.' },
        ],
      },
      {
        title: 'Ch 10 — Data Displays',
        description: 'Stem-and-leaf, histograms, box plots, and shape of distributions.',
        lessons: [
          { title: '10.1 Stem-and-Leaf Plots', description: 'Construct and read stem-and-leaf plots; describe the distribution.' },
          { title: '10.2 Histograms', description: 'Construct histograms with appropriate bin widths; interpret shape.' },
          { title: '10.3 Shapes of Distributions', description: 'Classify distributions as symmetric, skewed, or uniform; choose appropriate measures of center.' },
          { title: '10.4 Box-and-Whisker Plots', description: 'Construct box plots; identify the five-number summary.' },
        ],
      },
    ],
  },

  {
    slug: 'concepts-in-math',
    title: 'PAUSD Concepts in Math',
    description: 'PAUSD 7th-grade compacted track (Concepts in Math), aligned to Big Ideas Math: Modeling Real Life Course 2 Accelerated (red textbook). Combines all of Math 7 plus the bulk of Math 8.',
    subject: 'math',
    grade: '7',
    difficulty: 'advanced',
    textbook: 'Big Ideas Math: Modeling Real Life — Course 2 Accelerated',
    units: [
      {
        title: 'Ch 1 — Adding and Subtracting Rational Numbers',
        description: 'Signed-rational addition and subtraction with full algorithmic fluency.',
        lessons: [
          { title: '1.1 Rational Numbers', description: 'Identify rational numbers; convert between fraction and decimal forms.' },
          { title: '1.2 Adding Integers', description: 'Apply sign rules to add integers using the number line.' },
          { title: '1.3 Adding Rational Numbers', description: 'Add positive and negative fractions and decimals.' },
          { title: '1.4 Subtracting Integers', description: 'Subtract integers by adding the additive inverse.' },
          { title: '1.5 Subtracting Rational Numbers', description: 'Subtract positive and negative fractions and decimals.' },
        ],
      },
      {
        title: 'Ch 2 — Multiplying and Dividing Rational Numbers',
        description: 'Signed-rational multiplication and division.',
        lessons: [
          { title: '2.1 Multiplying Integers', description: 'Apply sign rules to multiply integers.' },
          { title: '2.2 Dividing Integers', description: 'Apply sign rules to divide integers; identify undefined cases.' },
          { title: '2.3 Converting Between Fractions and Decimals', description: 'Convert exactly between fraction and decimal forms; identify repeating decimals.' },
          { title: '2.4 Multiplying Rational Numbers', description: 'Multiply signed fractions and decimals.' },
          { title: '2.5 Dividing Rational Numbers', description: 'Divide signed fractions and decimals; simplify complex fractions.' },
        ],
      },
      {
        title: 'Ch 3 — Expressions',
        description: 'Algebraic expressions and the distributive property.',
        lessons: [
          { title: '3.1 Algebraic Expressions', description: 'Translate verbal phrases into algebraic expressions and back.' },
          { title: '3.2 Adding and Subtracting Linear Expressions', description: 'Combine like terms across multi-variable expressions.' },
          { title: '3.3 The Distributive Property', description: 'Apply the distributive property to expand and factor expressions.' },
          { title: '3.4 Factoring Expressions', description: 'Factor out a GCF from algebraic expressions.' },
        ],
      },
      {
        title: 'Ch 4 — Equations and Inequalities',
        description: 'Multi-step equations and inequalities with rational coefficients.',
        lessons: [
          { title: '4.1 Solving Equations Using Addition or Subtraction', description: 'Solve one-step equations; verify by substitution.' },
          { title: '4.2 Solving Equations Using Multiplication or Division', description: 'Solve one-step equations including with rational coefficients.' },
          { title: '4.3 Solving Two-Step Equations', description: 'Solve two-step equations; translate two-step word problems.' },
          { title: '4.4 Solving Multi-Step Equations', description: 'Solve equations with distribution, combining like terms, and variables on both sides.' },
          { title: '4.5 Writing and Graphing Inequalities', description: 'Write inequalities for verbal statements; graph on a number line.' },
          { title: '4.6 Solving Two-Step Inequalities', description: 'Solve two-step inequalities including the sign-flip rule.' },
        ],
      },
      {
        title: 'Ch 5 — Ratios and Proportions',
        description: 'Proportional relationships and the constant of proportionality.',
        lessons: [
          { title: '5.1 Ratios and Ratio Tables', description: 'Build ratio tables; find equivalent ratios in context.' },
          { title: '5.2 Rates and Unit Rates', description: 'Compute unit rates with non-trivial denominators.' },
          { title: '5.3 Identifying Proportional Relationships', description: 'Test for a constant ratio in tables and graphs.' },
          { title: '5.4 Writing and Solving Proportions', description: 'Set up and solve proportions using cross products.' },
          { title: '5.5 Graphs of Proportional Relationships', description: 'Recognize proportional relationships from a graph; identify the unit rate as the slope.' },
          { title: '5.6 Scale Drawings', description: 'Apply scale drawings to compute lengths, areas, and volumes.' },
        ],
      },
      {
        title: 'Ch 6 — Percents',
        description: 'Percent of change, simple interest, and percent applications.',
        lessons: [
          { title: '6.1 Fractions, Decimals, and Percents', description: 'Convert between forms; place values on a number line.' },
          { title: '6.2 The Percent Proportion', description: 'Apply the percent proportion to find the part, percent, or whole.' },
          { title: '6.3 The Percent Equation', description: 'Apply the percent equation to multi-step problems.' },
          { title: '6.4 Percents of Increase and Decrease', description: 'Compute percent of change and percent error.' },
          { title: '6.5 Discounts and Markups', description: 'Solve discount, markup, tax, and tip problems including chained percents.' },
          { title: '6.6 Simple Interest', description: 'Apply I = Prt to compute simple interest.' },
        ],
      },
      {
        title: 'Ch 7 — Probability',
        description: 'Theoretical and experimental probability, simulations, and compound events.',
        lessons: [
          { title: '7.1 Probability', description: 'Compute theoretical probability for uniform models.' },
          { title: '7.2 Experimental and Theoretical Probability', description: 'Compare experimental and theoretical probabilities; reason about convergence.' },
          { title: '7.3 Compound Events', description: 'Use tree diagrams and the counting principle to compute compound probabilities.' },
          { title: '7.4 Simulations', description: 'Design simulations to estimate probabilities.' },
          { title: '7.5 Independent and Dependent Events', description: 'Distinguish the two; compute conditional probabilities.' },
        ],
      },
      {
        title: 'Ch 8 — Statistics',
        description: 'Sampling, inference, and comparing populations.',
        lessons: [
          { title: '8.1 Samples and Populations', description: 'Distinguish samples from populations; identify biased sampling methods.' },
          { title: '8.2 Using Random Samples to Describe Populations', description: 'Use samples to estimate population parameters.' },
          { title: '8.3 Comparing Populations', description: 'Compare two distributions using center, spread, and MAD.' },
        ],
      },
      {
        title: 'Ch 9 — Geometric Shapes and Angles',
        description: 'Angle relationships, polygon angle sums, and circle measures.',
        lessons: [
          { title: '9.1 Adjacent and Vertical Angles', description: 'Identify and apply adjacent and vertical angle relationships.' },
          { title: '9.2 Complementary and Supplementary Angles', description: 'Identify and apply complementary and supplementary relationships.' },
          { title: '9.3 Triangles', description: 'Apply the triangle angle-sum theorem; classify triangles.' },
          { title: '9.4 Quadrilaterals', description: 'Classify quadrilaterals; apply the quadrilateral angle-sum theorem.' },
          { title: '9.5 Scale Drawings', description: 'Apply scale factor to find missing lengths and areas.' },
        ],
      },
      {
        title: 'Ch 10 — Surface Area and Volume',
        description: 'Surface area and volume of prisms, pyramids, cylinders, cones, and spheres.',
        lessons: [
          { title: '10.1 Circles and Circumference', description: 'Apply C = 2πr; solve composite-figure problems.' },
          { title: '10.2 Perimeters and Areas of Composite Figures', description: 'Compute perimeter and area of composite figures by decomposition.' },
          { title: '10.3 Areas of Circles', description: 'Apply A = πr²; solve sector and segment problems.' },
          { title: '10.4 Surface Areas of Prisms and Cylinders', description: 'Compute surface areas using nets.' },
          { title: '10.5 Surface Areas of Pyramids and Cones', description: 'Compute surface areas of right pyramids and cones.' },
          { title: '10.6 Volumes of Prisms and Cylinders', description: 'Apply V = Bh.' },
          { title: '10.7 Volumes of Pyramids and Cones', description: 'Apply V = (1/3)Bh; reason about the (1/3) factor.' },
        ],
      },
      {
        title: 'Ch 11 — Transformations',
        description: 'Translations, reflections, rotations, dilations, and similar figures.',
        lessons: [
          { title: '11.1 Translations', description: 'Apply translation rules to coordinates; verify congruence.' },
          { title: '11.2 Reflections', description: 'Apply reflection rules across axes and y = ±x.' },
          { title: '11.3 Rotations', description: 'Apply 90°, 180°, 270° rotation rules about the origin.' },
          { title: '11.4 Congruent Figures', description: 'Define congruence as a sequence of rigid motions.' },
          { title: '11.5 Dilations', description: 'Apply dilations centered at the origin and elsewhere.' },
          { title: '11.6 Similar Figures', description: 'Define similarity as dilation + rigid motion; apply k, k², k³ scaling.' },
          { title: '11.7 Perimeters and Areas of Similar Figures', description: 'Apply the k and k² scaling rules to similar figures.' },
        ],
      },
      {
        title: 'Ch 12 — Real Numbers and the Pythagorean Theorem',
        description: 'Roots, irrationals, and the Pythagorean theorem with applications.',
        lessons: [
          { title: '12.1 Finding Square Roots', description: 'Compute square roots; classify roots as rational or irrational.' },
          { title: '12.2 Finding Cube Roots', description: 'Compute cube roots of positive and negative numbers.' },
          { title: '12.3 The Pythagorean Theorem', description: 'Apply the Pythagorean theorem to find missing sides of right triangles.' },
          { title: '12.4 Approximating Square Roots', description: 'Estimate irrational square roots to a chosen precision.' },
          { title: '12.5 Using the Pythagorean Theorem', description: 'Apply Pythagoras to mixed problems including 3D and coordinate geometry.' },
        ],
      },
    ],
  },

  {
    slug: 'algebra-1',
    title: 'PAUSD Algebra 1',
    description: 'PAUSD Algebra 1, aligned to Big Ideas Math Algebra 1: A Common Core Curriculum (blue and gold textbook). Honors-tier depth on every chapter.',
    subject: 'math',
    grade: '8-9',
    difficulty: 'advanced',
    textbook: 'Big Ideas Math Algebra 1: A Common Core Curriculum',
    units: [
      {
        title: 'Ch 1 — Solving Linear Equations',
        description: 'One-variable linear equations including absolute-value and literal equations.',
        textbookContext: 'Big Ideas Math Algebra 1, Chapter 1 covers Sections 1.1-1.5: simple equations, multi-step equations, variables on both sides, absolute-value equations, and rewriting formulas. Standard problem types include 2(x+3)-4=12, |2x-5|=11, and solving I=Prt for r.',
        lessons: [
          { title: '1.1 Solving Simple Equations', description: 'Solve one-step equations using inverse operations; verify by substitution.' },
          { title: '1.2 Solving Multi-Step Equations', description: 'Solve multi-step equations with distribution and combining like terms.' },
          { title: 'Drill: Multi-Step Equations on the canvas', description: 'Walk through worked multi-step problems with step-by-step feedback on the handwriting canvas.', type: 'math_tutor' },
          { title: '1.3 Solving Equations with Variables on Both Sides', description: 'Solve equations with variables on both sides; identify identities and contradictions.' },
          { title: '1.4 Solving Absolute Value Equations', description: 'Solve |ax + b| = c; reason about the two-case structure.' },
          { title: '1.5 Rewriting Equations and Formulas', description: 'Rearrange formulas to solve for a specified variable.' },
          { title: 'Practice Set: Chapter 1', description: 'Solve a mixed Chapter 1 problem set on the math canvas — mostly section-3+ difficulty with one stretch problem.', type: 'practice' },
        ],
      },
      {
        title: 'Ch 2 — Solving Linear Inequalities',
        description: 'Linear inequalities, compound inequalities, and absolute-value inequalities.',
        lessons: [
          { title: '2.1 Writing and Graphing Inequalities', description: 'Translate verbal inequalities; graph on a number line.' },
          { title: '2.2 Solving Inequalities Using Addition or Subtraction', description: 'Solve and graph one-step inequalities.' },
          { title: '2.3 Solving Inequalities Using Multiplication or Division', description: 'Solve and graph; apply the sign-flip rule when multiplying by a negative.' },
          { title: '2.4 Solving Multi-Step Inequalities', description: 'Solve multi-step inequalities with distribution and combining like terms.' },
          { title: '2.5 Solving Compound Inequalities', description: 'Solve "and" and "or" compound inequalities; graph the solution set.' },
          { title: '2.6 Solving Absolute Value Inequalities', description: 'Solve |ax + b| < c and |ax + b| > c; graph the solutions.' },
        ],
      },
      {
        title: 'Ch 3 — Graphing Linear Functions',
        description: 'Functions, function notation, slope, and graphing linear functions.',
        lessons: [
          { title: '3.1 Functions', description: 'Define functions; apply the vertical line test; identify domain and range.' },
          { title: '3.2 Linear Functions', description: 'Recognize linear functions; distinguish from nonlinear.' },
          { title: '3.3 Function Notation', description: 'Read and write function notation; evaluate f(a) and solve f(x) = b.' },
          { title: '3.4 Graphing Linear Equations in Standard Form', description: 'Graph Ax + By = C using intercepts.' },
          { title: '3.5 Graphing Linear Equations in Slope-Intercept Form', description: 'Graph y = mx + b; identify slope and y-intercept.' },
          { title: '3.6 Transformations of Graphs of Linear Functions', description: 'Apply translations, reflections, stretches, and shrinks to linear graphs.' },
          { title: '3.7 Graphing Absolute Value Functions', description: 'Graph y = |x| and its transformations.' },
        ],
      },
      {
        title: 'Ch 4 — Writing Linear Functions',
        description: 'Writing equations of lines, scatter plots, and arithmetic sequences.',
        lessons: [
          { title: '4.1 Writing Equations in Slope-Intercept Form', description: 'Write y = mx + b given a graph or two points.' },
          { title: '4.2 Writing Equations in Point-Slope Form', description: 'Write y − y₁ = m(x − x₁); convert to slope-intercept.' },
          { title: '4.3 Writing Equations of Parallel and Perpendicular Lines', description: 'Use slope relationships to write equations of parallel and perpendicular lines.' },
          { title: '4.4 Scatter Plots and Lines of Fit', description: 'Construct scatter plots; draw a line of best fit by eye.' },
          { title: '4.5 Analyzing Lines of Fit', description: 'Compute and interpret residuals; assess whether a linear model is appropriate.' },
          { title: '4.6 Arithmetic Sequences', description: 'Write explicit and recursive forms; compute the nth term.' },
          { title: '4.7 Piecewise Functions', description: 'Evaluate and graph piecewise functions including step functions.' },
        ],
      },
      {
        title: 'Ch 5 — Solving Systems of Linear Equations',
        description: 'Systems by graphing, substitution, and elimination, plus systems of inequalities.',
        lessons: [
          { title: '5.1 Solving Systems of Linear Equations by Graphing', description: 'Solve by graphing; classify the three solution cases.' },
          { title: '5.2 Solving Systems of Linear Equations by Substitution', description: 'Solve by substitution; identify the cleanest variable to isolate.' },
          { title: '5.3 Solving Systems of Linear Equations by Elimination', description: 'Solve by elimination; scale equations to align coefficients.' },
          { title: '5.4 Solving Special Systems of Linear Equations', description: 'Recognize systems with no solution and infinite solutions.' },
          { title: '5.5 Solving Equations by Graphing', description: 'Solve f(x) = g(x) by graphing both sides.' },
          { title: '5.6 Graphing Linear Inequalities in Two Variables', description: 'Graph linear inequalities; shade the correct half-plane.' },
          { title: '5.7 Systems of Linear Inequalities', description: 'Graph systems of inequalities; identify the feasible region.' },
        ],
      },
      {
        title: 'Ch 6 — Exponential Functions and Sequences',
        description: 'Exponent rules, exponential functions, and geometric sequences.',
        lessons: [
          { title: '6.1 Properties of Exponents', description: 'Apply product, quotient, and power-of-a-power rules.' },
          { title: '6.2 Radicals and Rational Exponents', description: 'Interpret a^(m/n) as ⁿ√(aᵐ); convert between radical and rational-exponent forms.' },
          { title: '6.3 Exponential Functions', description: 'Graph y = a·bˣ; identify a and b.' },
          { title: '6.4 Exponential Growth and Decay', description: 'Build models y = a(1 ± r)ᵗ; interpret r in context.' },
          { title: '6.5 Solving Exponential Equations', description: 'Solve a·bˣ = c using common bases.' },
          { title: '6.6 Geometric Sequences', description: 'Write explicit and recursive forms; compute the nth term.' },
          { title: '6.7 Recursively Defined Sequences', description: 'Define sequences recursively; convert recursive to explicit when possible.' },
        ],
      },
      {
        title: 'Ch 7 — Polynomial Equations and Factoring',
        description: 'Polynomial operations, special products, and factoring.',
        lessons: [
          { title: '7.1 Adding and Subtracting Polynomials', description: 'Combine polynomials; collect like terms.' },
          { title: '7.2 Multiplying Polynomials', description: 'Multiply polynomials by distribution and area model.' },
          { title: '7.3 Special Products of Polynomials', description: 'Recognize and expand (a±b)² and (a+b)(a−b).' },
          { title: '7.4 Solving Polynomial Equations in Factored Form', description: 'Apply the zero-product property to factored polynomial equations.' },
          { title: '7.5 Factoring x² + bx + c', description: 'Factor monic trinomials by finding the right pair of integers.' },
          { title: '7.6 Factoring ax² + bx + c', description: 'Factor non-monic trinomials using the AC method.' },
          { title: '7.7 Factoring Special Products', description: 'Factor difference of squares and perfect-square trinomials.' },
          { title: '7.8 Factoring Polynomials Completely', description: 'Combine GCF, special-product, and trinomial factoring.' },
        ],
      },
      {
        title: 'Ch 8 — Graphing Quadratic Functions',
        description: 'Quadratic functions in standard, vertex, and intercept form.',
        lessons: [
          { title: '8.1 Graphing f(x) = ax²', description: 'Graph the basic parabola; identify vertex and axis of symmetry.' },
          { title: '8.2 Graphing f(x) = ax² + c', description: 'Apply vertical translations to the basic parabola.' },
          { title: '8.3 Graphing f(x) = ax² + bx + c', description: 'Find the vertex using x = −b/(2a); graph from standard form.' },
          { title: '8.4 Graphing f(x) = a(x − h)² + k', description: 'Graph in vertex form; identify vertex directly from the equation.' },
          { title: '8.5 Using Intercept Form', description: 'Graph from intercept form f(x) = a(x − p)(x − q); identify x-intercepts.' },
          { title: '8.6 Comparing Linear, Exponential, and Quadratic Functions', description: 'Distinguish three function families by shape, growth rate, and end behavior.' },
        ],
      },
      {
        title: 'Ch 9 — Solving Quadratic Equations',
        description: 'Solving quadratic equations by all standard methods.',
        lessons: [
          { title: '9.1 Properties of Radicals', description: 'Simplify radicals using product and quotient properties.' },
          { title: '9.2 Solving Quadratic Equations by Graphing', description: 'Solve quadratics by reading x-intercepts.' },
          { title: '9.3 Solving Quadratic Equations Using Square Roots', description: 'Solve (x − h)² = k by taking square roots.' },
          { title: '9.4 Solving Quadratic Equations by Completing the Square', description: 'Complete the square algebraically; solve and convert to vertex form.' },
          { title: '9.5 Solving Quadratic Equations Using the Quadratic Formula', description: 'Apply the quadratic formula; use the discriminant to predict solution count.' },
          { title: '9.6 Solving Nonlinear Systems of Equations', description: 'Solve systems containing one quadratic and one linear equation.' },
        ],
      },
      {
        title: 'Ch 10 — Radical Functions and Equations',
        description: 'Radical functions, equations, and inverses.',
        lessons: [
          { title: '10.1 Graphing Square Root Functions', description: 'Graph y = √x and its transformations.' },
          { title: '10.2 Graphing Cube Root Functions', description: 'Graph y = ∛x and its transformations.' },
          { title: '10.3 Solving Radical Equations', description: 'Solve square-root and cube-root equations; check for extraneous solutions.' },
          { title: '10.4 Inverse of a Function', description: 'Find inverse functions; verify with f(f⁻¹(x)) = x.' },
        ],
      },
      {
        title: 'Ch 11 — Data Analysis and Displays',
        description: 'Univariate and bivariate statistics with regression and two-way tables.',
        lessons: [
          { title: '11.1 Measures of Center and Variation', description: 'Compute mean, median, range, IQR, and standard deviation.' },
          { title: '11.2 Box-and-Whisker Plots', description: 'Construct box plots; compare two distributions.' },
          { title: '11.3 Shapes of Distributions', description: 'Classify distributions; choose appropriate measures of center and variation.' },
          { title: '11.4 Two-Way Tables', description: 'Build two-way tables; compute joint, marginal, and conditional relative frequencies.' },
          { title: '11.5 Choosing a Data Display', description: 'Match a data display to the question; critique poor data displays.' },
        ],
      },
    ],
  },

  {
    slug: 'geometry-h',
    title: 'PAUSD Geometry H',
    description: 'PAUSD Honors Geometry, aligned to Big Ideas Math Geometry: A Common Core Curriculum, with PAUSD-honors enrichment (rigorous proofs, vectors, advanced circle theorems, geometric probability).',
    subject: 'math',
    grade: '9',
    difficulty: 'advanced',
    textbook: 'Big Ideas Math Geometry: A Common Core Curriculum',
    units: [
      {
        title: 'Ch 1 — Basics of Geometry',
        description: 'Points, lines, planes, distance, midpoint, and constructions.',
        lessons: [
          { title: '1.1 Points, Lines, and Planes', description: 'Use proper geometric notation; identify and name geometric objects.' },
          { title: '1.2 Measuring and Constructing Segments', description: 'Apply the segment addition postulate; construct congruent segments.' },
          { title: '1.3 Using Midpoint and Distance Formulas', description: 'Apply the midpoint and distance formulas; reason about why each works.' },
          { title: '1.4 Perimeter and Area in the Coordinate Plane', description: 'Compute perimeter and area of polygons given by coordinates.' },
          { title: '1.5 Measuring and Constructing Angles', description: 'Apply the angle addition postulate; construct angle bisectors.' },
          { title: '1.6 Describing Pairs of Angles', description: 'Identify complementary, supplementary, vertical, and adjacent pairs.' },
        ],
      },
      {
        title: 'Ch 2 — Reasoning and Proofs',
        description: 'Logic, conditionals, and the structure of geometric proof.',
        lessons: [
          { title: '2.1 Conditional Statements', description: 'Write conditionals, converses, inverses, contrapositives, and biconditionals.' },
          { title: '2.2 Inductive and Deductive Reasoning', description: 'Distinguish the two; recognize the limits of inductive reasoning.' },
          { title: '2.3 Postulates and Diagrams', description: 'Identify which information is implied vs stated in geometric diagrams.' },
          { title: '2.4 Algebraic Reasoning', description: 'Prove algebraic statements with two-column proofs; cite properties of equality.' },
          { title: '2.5 Proving Statements about Segments and Angles', description: 'Write two-column proofs about segment and angle relationships.' },
          { title: '2.6 Proving Geometric Relationships', description: 'Prove vertical angles congruent and similar foundational results.' },
          { title: 'Honors enrichment: Indirect Proof', description: 'Set up proofs by contradiction; recognize when contradiction is the cleanest approach.' },
        ],
      },
      {
        title: 'Ch 3 — Parallel and Perpendicular Lines',
        description: 'Parallel lines, transversals, and slopes.',
        lessons: [
          { title: '3.1 Pairs of Lines and Angles', description: 'Identify all eight angles formed by parallel lines and a transversal.' },
          { title: '3.2 Parallel Lines and Transversals', description: 'Apply alternate-interior, alternate-exterior, corresponding, and co-interior theorems.' },
          { title: '3.3 Proofs with Parallel Lines', description: 'Use converses to prove lines parallel; write multi-step proofs.' },
          { title: '3.4 Proofs with Perpendicular Lines', description: 'Prove the perpendicular transversal theorem and lines-perpendicular-to-a-transversal theorem.' },
          { title: '3.5 Equations of Parallel and Perpendicular Lines', description: 'Use slope to write equations of parallel and perpendicular lines.' },
        ],
      },
      {
        title: 'Ch 4 — Transformations',
        description: 'Translations, reflections, rotations, dilations, and similarity transformations.',
        lessons: [
          { title: '4.1 Translations', description: 'Apply translation rules; verify congruence by sequence of motions.' },
          { title: '4.2 Reflections', description: 'Apply reflection rules across axes and y = ±x.' },
          { title: '4.3 Rotations', description: 'Apply 90°, 180°, 270° rotation rules about the origin.' },
          { title: '4.4 Congruence and Transformations', description: 'Define congruence as a sequence of rigid motions.' },
          { title: '4.5 Dilations', description: 'Apply dilations centered at the origin and elsewhere.' },
          { title: '4.6 Similarity and Transformations', description: 'Define similarity as dilation + rigid motion; verify using sequence.' },
          { title: 'Honors enrichment: Compositions and Glide Reflections', description: 'Compose isometries; classify all four types of plane isometries.' },
        ],
      },
      {
        title: 'Ch 5 — Congruent Triangles',
        description: 'Triangle congruence postulates and proofs.',
        lessons: [
          { title: '5.1 Angles of Triangles', description: 'Apply the triangle angle-sum and exterior-angle theorems.' },
          { title: '5.2 Congruent Polygons', description: 'Identify corresponding parts of congruent polygons.' },
          { title: '5.3 Proving Triangle Congruence by SAS', description: 'Apply SAS; identify when it does not apply.' },
          { title: '5.4 Equilateral and Isosceles Triangles', description: 'Prove and apply the isosceles triangle theorem and its converse.' },
          { title: '5.5 Proving Triangle Congruence by SSS', description: 'Apply SSS; chain triangle congruences.' },
          { title: '5.6 Proving Triangle Congruence by ASA and AAS', description: 'Apply ASA and AAS; reason about why SSA fails.' },
          { title: '5.7 Using Congruent Triangles (CPCTC)', description: 'Use CPCTC to derive corresponding parts after proving congruence.' },
          { title: '5.8 Coordinate Proofs', description: 'Set up and complete coordinate proofs.' },
          { title: 'Honors enrichment: HL theorem and right-triangle congruence', description: 'Prove and apply HL; reason about why it works for right triangles only.' },
        ],
      },
      {
        title: 'Ch 6 — Relationships Within Triangles',
        description: 'Bisectors, medians, altitudes, and the triangle inequality.',
        lessons: [
          { title: '6.1 Perpendicular and Angle Bisectors', description: 'Apply the perpendicular and angle bisector theorems.' },
          { title: '6.2 Bisectors of Triangles', description: 'Locate the circumcenter and incenter; reason about concurrency.' },
          { title: '6.3 Medians and Altitudes of Triangles', description: 'Locate the centroid and orthocenter; apply the centroid theorem.' },
          { title: '6.4 The Triangle Midsegment Theorem', description: 'Prove and apply the midsegment theorem.' },
          { title: '6.5 Indirect Proof and Inequalities in One Triangle', description: 'Apply the triangle inequality and the longer-side-opposite-larger-angle theorem.' },
          { title: '6.6 Inequalities in Two Triangles', description: 'Apply the hinge theorem and its converse.' },
          { title: 'Honors enrichment: Euler line and nine-point circle', description: 'Examine the Euler line and the nine-point circle conceptually.' },
        ],
      },
      {
        title: 'Ch 7 — Quadrilaterals and Other Polygons',
        description: 'Polygon angle sums and properties of special quadrilaterals.',
        lessons: [
          { title: '7.1 Angles of Polygons', description: 'Derive and apply the polygon interior and exterior angle-sum theorems.' },
          { title: '7.2 Properties of Parallelograms', description: 'Prove and apply the parallelogram properties.' },
          { title: '7.3 Proving That a Quadrilateral Is a Parallelogram', description: 'Apply the converses to prove parallelogram.' },
          { title: '7.4 Properties of Special Parallelograms', description: 'Apply rectangle, rhombus, and square properties.' },
          { title: '7.5 Properties of Trapezoids and Kites', description: 'Apply trapezoid and kite properties; use the trapezoid midsegment theorem.' },
        ],
      },
      {
        title: 'Ch 8 — Similarity',
        description: 'Similar polygons, similarity postulates, and proportions in geometry.',
        lessons: [
          { title: '8.1 Similar Polygons', description: 'Identify similar polygons; apply the scale factor.' },
          { title: '8.2 Proving Triangle Similarity by AA', description: 'Apply AA; distinguish from triangle congruence.' },
          { title: '8.3 Proving Triangle Similarity by SSS and SAS', description: 'Apply SSS and SAS similarity; chain similarity proofs.' },
          { title: '8.4 Proportionality Theorems', description: 'Apply the side-splitter and angle-bisector theorems.' },
          { title: 'Honors enrichment: Geometric mean theorems', description: 'Apply geometric mean and altitude-on-hypotenuse theorems for right triangles.' },
        ],
      },
      {
        title: 'Ch 9 — Right Triangles and Trigonometry',
        description: 'Pythagorean theorem, special triangles, and trigonometry.',
        lessons: [
          { title: '9.1 The Pythagorean Theorem', description: 'Apply Pythagoras and its converse; classify triangles using sides.' },
          { title: '9.2 Special Right Triangles', description: 'Derive and apply 45-45-90 and 30-60-90 ratios.' },
          { title: '9.3 Similar Right Triangles', description: 'Apply the right triangle altitude theorem.' },
          { title: '9.4 The Tangent Ratio', description: 'Define and apply the tangent ratio in right triangles.' },
          { title: '9.5 The Sine and Cosine Ratios', description: 'Define and apply sine and cosine; solve right triangles.' },
          { title: '9.6 Solving Right Triangles', description: 'Apply inverse trig functions to find missing angles.' },
          { title: '9.7 Law of Sines and Law of Cosines', description: 'Apply the law of sines and law of cosines to oblique triangles.' },
          { title: 'Honors enrichment: Trigonometric identities', description: 'Prove the Pythagorean identity and complementary-angle identities.' },
        ],
      },
      {
        title: 'Ch 10 — Circles',
        description: 'Circle theorems, central and inscribed angles, and tangent properties.',
        lessons: [
          { title: '10.1 Lines and Segments That Intersect Circles', description: 'Identify chords, secants, tangents, and arcs.' },
          { title: '10.2 Finding Arc Measures', description: 'Compute arc measures from central angles.' },
          { title: '10.3 Using Chords', description: 'Apply chord-perpendicular-bisector theorems.' },
          { title: '10.4 Inscribed Angles and Polygons', description: 'Apply the inscribed angle theorem; reason about cyclic quadrilaterals.' },
          { title: '10.5 Angle Relationships in Circles', description: 'Apply chord-chord, secant-secant, tangent-secant angle theorems.' },
          { title: '10.6 Segment Relationships in Circles', description: 'Apply the power of a point in all three configurations.' },
          { title: '10.7 Circles in the Coordinate Plane', description: 'Write circle equations; complete the square to find center and radius.' },
        ],
      },
      {
        title: 'Ch 11 — Circumference, Area, and Volume',
        description: 'Areas and volumes of plane and solid figures, plus Cavalieri\'s principle.',
        lessons: [
          { title: '11.1 Circumference and Arc Length', description: 'Apply C = 2πr; compute arc length in radians and degrees.' },
          { title: '11.2 Areas of Circles and Sectors', description: 'Apply A = πr²; compute sector and segment areas.' },
          { title: '11.3 Areas of Polygons', description: 'Compute areas of regular polygons using the apothem.' },
          { title: '11.4 Three-Dimensional Figures', description: 'Identify cross-sections of 3D solids.' },
          { title: '11.5 Volumes of Prisms and Cylinders', description: 'Apply V = Bh; solve composite-figure problems.' },
          { title: '11.6 Volumes of Pyramids and Cones', description: 'Apply V = (1/3)Bh; reason about the (1/3) factor.' },
          { title: '11.7 Surface Areas and Volumes of Spheres', description: 'Apply SA = 4πr² and V = (4/3)πr³.' },
          { title: '11.8 Surface Areas and Volumes of Similar Solids', description: 'Apply k, k², k³ scaling rules to similar solids.' },
          { title: 'Honors enrichment: Cavalieri\'s principle', description: 'State and apply Cavalieri\'s principle; use it to derive sphere volume.' },
        ],
      },
      {
        title: 'Ch 12 — Probability',
        description: 'Probability, conditional probability, and geometric probability.',
        lessons: [
          { title: '12.1 Sample Spaces and Probability', description: 'Build sample spaces; compute probabilities for compound events.' },
          { title: '12.2 Independent and Dependent Events', description: 'Distinguish the two; compute conditional probabilities.' },
          { title: '12.3 Two-Way Tables and Probability', description: 'Compute conditional probabilities from two-way tables.' },
          { title: '12.4 Probability of Disjoint and Overlapping Events', description: 'Apply the addition rule for disjoint and overlapping events.' },
          { title: '12.5 Permutations and Combinations', description: 'Apply nPr and nCr to counting problems.' },
          { title: '12.6 Binomial Distributions', description: 'Compute binomial probabilities; recognize the binomial setting.' },
          { title: 'Honors enrichment: Geometric probability', description: 'Compute probabilities as length, area, and volume ratios.' },
        ],
      },
    ],
  },

  // =====================================================================
  // SCIENCE — NGSS California Integrated 1/2/3 (PAUSD's middle-school
  // sequence). Honors-tier expectations within the standard sequence.
  // =====================================================================
  {
    slug: 'science-6-earth',
    title: 'PAUSD 6th Grade Science: Earth & Space',
    description: 'NGSS California Integrated 1: plate tectonics, rocks, weathering, weather, climate, the solar system, and engineering design — at PAUSD honors-tier expectation.',
    subject: 'science',
    grade: '6',
    difficulty: 'advanced',
    textbook: 'NGSS California Integrated Science 1',
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
    description: 'NGSS California Integrated 2: cells, energy, body systems, genetics, evolution, ecology, and human impact — at PAUSD honors-tier expectation.',
    subject: 'science',
    grade: '7',
    difficulty: 'advanced',
    textbook: 'NGSS California Integrated Science 2',
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
    description: 'NGSS California Integrated 3: atoms, chemical reactions, forces, energy, waves, and electricity & magnetism — at PAUSD honors-tier expectation.',
    subject: 'science',
    grade: '8',
    difficulty: 'advanced',
    textbook: 'NGSS California Integrated Science 3',
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

// Helper: list summary cards for the catalog UI.
export function listPausdCatalog() {
  return PAUSD_CATALOG.map(c => ({
    slug: c.slug,
    title: c.title,
    description: c.description,
    subject: c.subject,
    grade: c.grade,
    difficulty: c.difficulty,
    textbook: c.textbook || null,
    unitCount: (c.units || []).length,
    lessonCount: (c.units || []).reduce((n, u) => n + (u.lessons || []).length, 0),
  }));
}
