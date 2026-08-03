'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function LandingPage() {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-slide carousel every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => setCarouselIndex((prev) => (prev === 0 ? 1 : 0));
  const prevSlide = () => setCarouselIndex((prev) => (prev === 0 ? 1 : 0));

  return (
    <>
      {/* Load Bootstrap, Bootstrap Icons, and FontAwesome CDNs */}
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet" />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" rel="stylesheet" />

      {/* Template CSS variables overridden to match blue/cyan brand colors */}
      <style>{`
        :root {
          --primary: #2563eb;       /* Brand Blue */
          --secondary: #06b6d4;     /* Cyan */
          --light: #eff6ff;         /* Very Light Blue */
          --dark: #0f172a;          /* Deep Slate */
        }

        body {
          font-family: 'Nunito', sans-serif;
          background: #ffffff;
          color: #5c6278;
        }

        .fw-medium { font-weight: 600 !important; }
        .fw-semi-bold { font-weight: 700 !important; }

        /* Navbar link overrides */
        .navbar-light .navbar-nav .nav-link {
          margin-right: 30px;
          padding: 25px 0;
          color: var(--dark);
          font-size: 15px;
          text-transform: uppercase;
          font-weight: 500;
          outline: none;
        }
        .navbar-light .navbar-nav .nav-link:hover,
        .navbar-light .navbar-nav .nav-link.active {
          color: var(--primary);
        }

        .navbar-brand h2 {
          font-family: 'Nunito', sans-serif;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        @media (max-width: 991.98px) {
          .navbar-light .navbar-nav .nav-link {
            margin-right: 0;
            padding: 10px 0;
          }
          .navbar-light .navbar-nav {
            border-top: 1px solid #eeeeee;
          }
        }

        .navbar-light .navbar-brand,
        .navbar-light a.btn-nav-join {
          height: 75px;
          display: flex;
          align-items: center;
        }

        /* Hero Carousel Styles */
        .carousel-container {
          position: relative;
          width: 100%;
          min-height: 650px;
          overflow: hidden;
          background: #181d38;
        }
        .carousel-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.8s ease-in-out;
          display: flex;
          align-items: center;
          background-size: cover;
          background-position: center;
        }
        .carousel-slide.active {
          opacity: 1;
          z-index: 2;
        }
        .carousel-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 43, 0.7);
        }
        .carousel-content {
          position: relative;
          z-index: 3;
          width: 100%;
        }

        .carousel-control-prev,
        .carousel-control-next {
          z-index: 5;
          width: 45px;
          height: 45px;
          background: transparent;
          border: 1px solid #ffffff;
          font-size: 22px;
          transition: 0.5s;
          opacity: 0.8;
          top: 50%;
          transform: translateY(-50%);
        }
        .carousel-control-prev:hover,
        .carousel-control-next:hover {
          background: var(--primary);
          border-color: var(--primary);
          opacity: 1;
        }
        .carousel-control-prev { left: 4%; }
        .carousel-control-next { right: 4%; }

        /* Section Title */
        .section-title {
          position: relative;
          display: inline-block;
          text-transform: uppercase;
        }
        .section-title::before {
          position: absolute;
          content: "";
          width: calc(100% + 80px);
          height: 2px;
          top: 4px;
          left: -40px;
          background: var(--primary);
          z-index: -1;
        }
        .section-title::after {
          position: absolute;
          content: "";
          width: calc(100% + 120px);
          height: 2px;
          bottom: 5px;
          left: -60px;
          background: var(--primary);
          z-index: -1;
        }
        .section-title.text-start::before {
          width: calc(100% + 40px);
          left: 0;
        }
        .section-title.text-start::after {
          width: calc(100% + 60px);
          left: 0;
        }

        /* Service Item */
        .service-item {
          background: var(--light);
          transition: 0.5s;
          border-radius: 8px;
        }
        .service-item:hover {
          margin-top: -10px;
          background: var(--primary);
        }
        .service-item * {
          transition: 0.5s;
        }
        .service-item:hover * {
          color: var(--light) !important;
        }

        /* Categories & Courses */
        .category img,
        .course-item img {
          transition: 0.5s;
        }
        .category a:hover img,
        .course-item:hover img {
          transform: scale(1.1);
        }

        /* Team */
        .team-item img {
          transition: 0.5s;
        }
        .team-item:hover img {
          transform: scale(1.1);
        }
        .team-item {
          border-radius: 8px;
          overflow: hidden;
        }

        /* Testimonials */
        .testi-card {
          background: var(--light);
          border-radius: 8px;
          transition: 0.3s;
        }
        .testi-card:hover {
          background: var(--primary);
          color: #ffffff !important;
        }
        .testi-card:hover p, .testi-card:hover h5, .testi-card:hover span {
          color: #ffffff !important;
        }

        /* Footer btn socials */
        .footer .btn.btn-social {
          margin-right: 5px;
          width: 35px;
          height: 35px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--light);
          border: 1px solid #ffffff;
          border-radius: 35px;
          transition: 0.3s;
        }
        .footer .btn.btn-social:hover {
          color: var(--primary);
          background: #ffffff;
        }
        .footer .btn.btn-link {
          display: block;
          margin-bottom: 5px;
          padding: 0;
          text-align: left;
          color: #ffffff !important;
          font-size: 15px;
          font-weight: normal;
          text-transform: capitalize;
          transition: 0.3s;
        }
        .footer .btn.btn-link::before {
          position: relative;
          content: "\\f105";
          font-family: "Font Awesome 5 Free";
          font-weight: 900;
          margin-right: 10px;
        }
        .footer .btn.btn-link:hover {
          letter-spacing: 1px;
          box-shadow: none;
        }
      `}</style>

      {/* ─── NAVBAR START ─── */}
      <nav className="navbar navbar-expand-lg bg-white navbar-light shadow sticky-top p-0">
        <Link href="/" className="navbar-brand d-flex align-items-center px-4 px-lg-5 text-decoration-none">
          <Image src="/colored_logo.png" alt="CyberPurview" width={180} height={50} style={{ objectFit: 'contain' }} priority />
        </Link>
        <button
          type="button"
          className="navbar-toggler me-4"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className={`collapse navbar-collapse ${mobileMenuOpen ? 'show' : ''}`} id="navbarCollapse">
          <div className="navbar-nav ms-auto p-4 p-lg-0">
            <a href="#" className="nav-item nav-link active">Home</a>
            <a href="#about" className="nav-item nav-link">About</a>
            <a href="#courses" className="nav-item nav-link">Courses</a>
            <a href="#testimonials" className="nav-item nav-link">Testimonials</a>
            <Link href="/login" className="nav-item nav-link">Portal Login</Link>
          </div>
          <Link href="/register" className="btn btn-primary py-4 px-lg-5 d-none d-lg-block btn-nav-join rounded-0 border-0">
            Join Now<i className="fa fa-arrow-right ms-3"></i>
          </Link>
        </div>
      </nav>
      {/* ─── NAVBAR END ─── */}

      {/* ─── CAROUSEL START ─── */}
      <div className="carousel-container">
        {/* Slide 1 */}
        <div
          className={`carousel-slide ${carouselIndex === 0 ? 'active' : ''}`}
          style={{ backgroundImage: `url('/img/carousel-1.jpg')` }}
        >
          <div className="carousel-overlay"></div>
          <div className="container carousel-content">
            <div className="row justify-content-start">
              <div className="col-sm-10 col-lg-8">
                <h5 className="text-primary text-uppercase mb-3">Launch Your Cybersecurity Career</h5>
                <h1 className="display-3 text-white">Best Hands-on GRC &amp; IT Audit Training</h1>
                <p className="fs-5 text-white mb-4 pb-2">Join our expert-led programs designed to equip you with real-world skills in Cybersecurity, IT Audit, Risk, and Governance.</p>
                <Link href="/register" className="btn btn-primary py-md-3 px-md-5 me-3 rounded-pill border-0">Browse Courses</Link>
                <Link href="/register" className="btn btn-light py-md-3 px-md-5 rounded-pill">Join Now</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 2 */}
        <div
          className={`carousel-slide ${carouselIndex === 1 ? 'active' : ''}`}
          style={{ backgroundImage: `url('/img/carousel-2.jpg')` }}
        >
          <div className="carousel-overlay"></div>
          <div className="container carousel-content">
            <div className="row justify-content-start">
              <div className="col-sm-10 col-lg-8">
                <h5 className="text-primary text-uppercase mb-3">Get Job-Ready Fast</h5>
                <h1 className="display-3 text-white">Learn from Industry Experts</h1>
                <p className="fs-5 text-white mb-4 pb-2">Our mission is to empower professionals to pivot into IT and cybersecurity through immersive, expert-led learning.</p>
                <Link href="/register" className="btn btn-primary py-md-3 px-md-5 me-3 rounded-pill border-0">Browse Courses</Link>
                <Link href="/register" className="btn btn-light py-md-3 px-md-5 rounded-pill">Join Now</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Controls */}
        <button className="carousel-control-prev rounded-circle position-absolute" onClick={prevSlide}>
          <i className="fa fa-chevron-left"></i>
        </button>
        <button className="carousel-control-next rounded-circle position-absolute" onClick={nextSlide}>
          <i className="fa fa-chevron-right"></i>
        </button>
      </div>
      {/* ─── CAROUSEL END ─── */}

      {/* ─── SERVICES START ─── */}
      <div className="container-xxl py-5">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-3 col-sm-6">
              <div className="service-item text-center pt-3 shadow-sm">
                <div className="p-4">
                  <i className="fa fa-3x fa-user-graduate text-primary mb-4"></i>
                  <h5 className="mb-3">Expert Mentorship</h5>
                  <p>Learn 1-on-1 from active industry professionals who guide you throughout your journey.</p>
                </div>
              </div>
            </div>
            <div className="col-lg-3 col-sm-6">
              <div className="service-item text-center pt-3 shadow-sm">
                <div className="p-4">
                  <i className="fa fa-3x fa-laptop-code text-primary mb-4"></i>
                  <h5 className="mb-3">Real-World Labs</h5>
                  <p>Gain hands-on practical experience in simulated environments with GRC &amp; Audit tools.</p>
                </div>
              </div>
            </div>
            <div className="col-lg-3 col-sm-6">
              <div className="service-item text-center pt-3 shadow-sm">
                <div className="p-4">
                  <i className="fa fa-3x fa-certificate text-primary mb-4"></i>
                  <h5 className="mb-3">Certification Prep</h5>
                  <p>Comprehensive curriculum aligned directly with CompTIA Security+, CISA, and CRISC frameworks.</p>
                </div>
              </div>
            </div>
            <div className="col-lg-3 col-sm-6">
              <div className="service-item text-center pt-3 shadow-sm">
                <div className="p-4">
                  <i className="fa fa-3x fa-briefcase text-primary mb-4"></i>
                  <h5 className="mb-3">Job Readiness</h5>
                  <p>Resume optimization, mock interviews, and career coaching to help you pivot quickly.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ─── SERVICES END ─── */}

      {/* ─── ABOUT START ─── */}
      <div id="about" className="container-xxl py-5">
        <div className="container">
          <div className="row g-5">
            <div className="col-lg-6" style={{ minHeight: '400px' }}>
              <div className="position-relative h-100 shadow rounded overflow-hidden">
                <img className="img-fluid position-absolute w-100 h-100" src="/img/about.jpg" alt="About CyberPurview" style={{ objectFit: 'cover' }} />
              </div>
            </div>
            <div className="col-lg-6">
              <h6 className="section-title bg-white text-start text-primary pe-3">About Us</h6>
              <h1 className="mb-4">Welcome to CyberPurview</h1>
              <p className="mb-4">We bridge the gap between ambition and opportunity — helping professionals pivot into IT and cybersecurity careers through immersive, expert-led learning.</p>
              <p className="mb-4">Our mission is to empower the next generation of cybersecurity and IT audit professionals with the skills, knowledge, and confidence to excel in enterprise environments.</p>
              <div className="row gy-2 gx-4 mb-4">
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>Skilled Instructors</p>
                </div>
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>Real-World Labs</p>
                </div>
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>International Certificate Prep</p>
                </div>
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>Job Placement Support</p>
                </div>
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>Interactive Study Rooms</p>
                </div>
                <div className="col-sm-6">
                  <p className="mb-0 text-dark fw-medium"><i className="fa fa-arrow-right text-primary me-2"></i>Lifetime Network Access</p>
                </div>
              </div>
              <Link className="btn btn-primary py-3 px-5 mt-2 rounded-pill border-0" href="/register">Read More</Link>
            </div>
          </div>
        </div>
      </div>
      {/* ─── ABOUT END ─── */}

      {/* ─── CATEGORIES START ─── */}
      <div className="container-xxl py-5 category">
        <div className="container">
          <div className="text-center">
            <h6 className="section-title bg-white text-center text-primary px-3">Categories</h6>
            <h1 className="mb-5">Training Frameworks</h1>
          </div>
          <div className="row g-3">
            <div className="col-lg-7 col-md-6">
              <div className="row g-3">
                <div className="col-lg-12 col-md-12">
                  <a className="position-relative d-block overflow-hidden shadow-sm rounded" href="">
                    <img className="img-fluid w-100" src="/img/cat-1.jpg" alt="" />
                    <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: '1px' }}>
                      <h5 className="m-0 text-dark">Cybersecurity</h5>
                      <small className="text-primary fw-bold">Active Programs</small>
                    </div>
                  </a>
                </div>
                <div className="col-lg-6 col-md-12">
                  <a className="position-relative d-block overflow-hidden shadow-sm rounded" href="">
                    <img className="img-fluid w-100" src="/img/cat-2.jpg" alt="" />
                    <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: '1px' }}>
                      <h5 className="m-0 text-dark">IT Audit &amp; SOX</h5>
                      <small className="text-primary fw-bold">Active Programs</small>
                    </div>
                  </a>
                </div>
                <div className="col-lg-6 col-md-12">
                  <a className="position-relative d-block overflow-hidden shadow-sm rounded" href="">
                    <img className="img-fluid w-100" src="/img/cat-3.jpg" alt="" />
                    <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: '1px' }}>
                      <h5 className="m-0 text-dark">Risk &amp; Governance</h5>
                      <small className="text-primary fw-bold">Active Programs</small>
                    </div>
                  </a>
                </div>
              </div>
            </div>
            <div className="col-lg-5 col-md-6" style={{ minHeight: '350px' }}>
              <a className="position-relative d-block h-100 overflow-hidden shadow-sm rounded" href="">
                <img className="img-fluid position-absolute w-100 h-100" src="/img/cat-4.jpg" alt="" style={{ objectFit: 'cover' }} />
                <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: '1px' }}>
                  <h5 className="m-0 text-dark">Cloud &amp; DevSecOps</h5>
                  <small className="text-primary fw-bold">Active Programs</small>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
      {/* ─── CATEGORIES END ─── */}

      {/* ─── COURSES START ─── */}
      <div id="courses" className="container-xxl py-5">
        <div className="container">
          <div className="text-center">
            <h6 className="section-title bg-white text-center text-primary px-3">Courses</h6>
            <h1 className="mb-5">Our Popular Programs</h1>
          </div>
          <div className="row g-4 justify-content-center">
            {/* Card 1 */}
            <div className="col-lg-4 col-md-6">
              <div className="course-item bg-light shadow-sm rounded overflow-hidden">
                <div className="position-relative overflow-hidden">
                  <img className="img-fluid w-100" src="/img/course-1.jpg" alt="" />
                  <div className="w-100 d-flex justify-content-center position-absolute bottom-0 start-0 mb-4">
                    <Link href="/register" className="btn btn-sm btn-primary px-3 border-end border-light text-white" style={{ borderRadius: '30px 0 0 30px' }}>Read More</Link>
                    <Link href="/register" className="btn btn-sm btn-primary px-3 text-white" style={{ borderRadius: '0 30px 30px 0' }}>Join Now</Link>
                  </div>
                </div>
                <div className="text-center p-4 pb-0">
                  <h3 className="mb-0 text-primary">$499.00</h3>
                  <div className="mb-3 text-warning">
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="text-muted ms-1">(145)</small>
                  </div>
                  <h5 className="mb-4 text-dark">Cybersecurity Career Accelerator Program</h5>
                </div>
                <div className="d-flex border-top text-muted">
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-user-tie text-primary me-2"></i>James Davidson</small>
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-clock text-primary me-2"></i>6 Months</small>
                  <small className="flex-fill text-center py-2"><i className="fa fa-user text-primary me-2"></i>Beginner</small>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="col-lg-4 col-md-6">
              <div className="course-item bg-light shadow-sm rounded overflow-hidden">
                <div className="position-relative overflow-hidden">
                  <img className="img-fluid w-100" src="/img/course-2.jpg" alt="" />
                  <div className="w-100 d-flex justify-content-center position-absolute bottom-0 start-0 mb-4">
                    <Link href="/register" className="btn btn-sm btn-primary px-3 border-end border-light text-white" style={{ borderRadius: '30px 0 0 30px' }}>Read More</Link>
                    <Link href="/register" className="btn btn-sm btn-primary px-3 text-white" style={{ borderRadius: '0 30px 30px 0' }}>Join Now</Link>
                  </div>
                </div>
                <div className="text-center p-4 pb-0">
                  <h3 className="mb-0 text-primary">$399.00</h3>
                  <div className="mb-3 text-warning">
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="text-muted ms-1">(98)</small>
                  </div>
                  <h5 className="mb-4 text-dark">IT Audit &amp; SOX Compliance Masterclass</h5>
                </div>
                <div className="d-flex border-top text-muted">
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-user-tie text-primary me-2"></i>Sarah Jenkins</small>
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-clock text-primary me-2"></i>4 Months</small>
                  <small className="flex-fill text-center py-2"><i className="fa fa-user text-primary me-2"></i>Intermediate</small>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="col-lg-4 col-md-6">
              <div className="course-item bg-light shadow-sm rounded overflow-hidden">
                <div className="position-relative overflow-hidden">
                  <img className="img-fluid w-100" src="/img/course-3.jpg" alt="" />
                  <div className="w-100 d-flex justify-content-center position-absolute bottom-0 start-0 mb-4">
                    <Link href="/register" className="btn btn-sm btn-primary px-3 border-end border-light text-white" style={{ borderRadius: '30px 0 0 30px' }}>Read More</Link>
                    <Link href="/register" className="btn btn-sm btn-primary px-3 text-white" style={{ borderRadius: '0 30px 30px 0' }}>Join Now</Link>
                  </div>
                </div>
                <div className="text-center p-4 pb-0">
                  <h3 className="mb-0 text-primary">Free</h3>
                  <div className="mb-3 text-warning">
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="fa fa-star"></small>
                    <small className="text-muted ms-1">(210)</small>
                  </div>
                  <h5 className="mb-4 text-dark">CompTIA Security+ Exam Prep &amp; Practice</h5>
                </div>
                <div className="d-flex border-top text-muted">
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-user-tie text-primary me-2"></i>Michael Okonkwo</small>
                  <small className="flex-fill text-center border-end py-2"><i className="fa fa-clock text-primary me-2"></i>Self-Paced</small>
                  <small className="flex-fill text-center py-2"><i className="fa fa-user text-primary me-2"></i>All Levels</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ─── COURSES END ─── */}



      {/* ─── TESTIMONIALS START ─── */}
      <div id="testimonials" className="container-xxl py-5">
        <div className="container">
          <div className="text-center">
            <h6 className="section-title bg-white text-center text-primary px-3">Testimonial</h6>
            <h1 className="mb-5">What Our Students Say!</h1>
          </div>
          <div className="row g-4 justify-content-center">
            {/* Student 1 */}
            <div className="col-lg-4 col-md-6">
              <div className="testi-card p-4 text-center shadow-sm">
                <img className="border rounded-circle p-2 mx-auto mb-3" src="/img/testimonial-1.jpg" style={{ width: '80px', height: '80px', objectFit: 'cover' }} alt="Sarah Mitchell" />
                <h5 className="mb-0 text-dark">Sarah Mitchell</h5>
                <p className="text-primary small mb-3">IT Auditor at Deloitte</p>
                <p className="mb-0 small">"Cyber Purview gave me the skills and confidence to transition from banking to cybersecurity. The hands-on labs and career coaching were game-changers."</p>
              </div>
            </div>

            {/* Student 2 */}
            <div className="col-lg-4 col-md-6">
              <div className="testi-card p-4 text-center shadow-sm">
                <img className="border rounded-circle p-2 mx-auto mb-3" src="/img/testimonial-2.jpg" style={{ width: '80px', height: '80px', objectFit: 'cover' }} alt="James Rodriguez" />
                <h5 className="mb-0 text-dark">James Rodriguez</h5>
                <p className="text-primary small mb-3">GRC Analyst at Microsoft</p>
                <p className="mb-0 small">"The SOX compliance training was exactly what I needed. I landed my dream role just 4 months after completing the program."</p>
              </div>
            </div>

            {/* Student 3 */}
            <div className="col-lg-4 col-md-6">
              <div className="testi-card p-4 text-center shadow-sm">
                <img className="border rounded-circle p-2 mx-auto mb-3" src="/img/testimonial-3.jpg" style={{ width: '80px', height: '80px', objectFit: 'cover' }} alt="Emily Chen" />
                <h5 className="mb-0 text-dark">Emily Chen</h5>
                <p className="text-primary small mb-3">Security Engineer at AWS</p>
                <p className="mb-0 small">"Outstanding program! The DevSecOps track prepared me perfectly for my current role. The instructors are world-class."</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ─── TESTIMONIALS END ─── */}

      {/* ─── FOOTER START ─── */}
      <div className="container-fluid bg-dark text-light footer pt-5 mt-5">
        <div className="container py-5">
          <div className="row g-5">
            <div className="col-lg-3 col-md-6">
              <div className="mb-4">
                <Image src="/cyberwhite.png" alt="CyberPurview" width={180} height={50} style={{ objectFit: 'contain' }} />
              </div>
              <p className="small text-white mb-4">Empowering the next generation of IT audit and cybersecurity professionals with hands-on training and expert preparation.</p>
              <p className="mb-2 text-white"><i className="fa fa-envelope me-3 text-white"></i>info@cyberpurview.com</p>
              <p className="mb-2 text-white"><i className="fa fa-map-marker-alt me-3 text-white"></i>U.S.-based, Remote Global Training</p>
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Quick Links</h4>
              <a className="btn btn-link text-decoration-none" href="#about">About Us</a>
              <a className="btn btn-link text-decoration-none" href="#courses">Our Courses</a>
              <Link className="btn btn-link text-decoration-none" href="/login">Portal Login</Link>
              <Link className="btn btn-link text-decoration-none" href="/register">Join Now</Link>
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Platform</h4>
              <Link className="btn btn-link text-decoration-none" href="/login">Student Dashboard</Link>
              <Link className="btn btn-link text-decoration-none" href="/register">Student Registration</Link>
              <a className="btn btn-link text-decoration-none" href="#">Privacy Policy</a>
              <a className="btn btn-link text-decoration-none" href="#">Terms &amp; Conditions</a>
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Newsletter</h4>
              <p className="text-white">Sign up to receive GRC, IT Audit and Cybersecurity study guides.</p>
              <div className="position-relative mx-auto" style={{ maxWidth: '400px' }}>
                <input className="form-control border-0 w-100 py-3 ps-4 pe-5" type="text" placeholder="Your email" />
                <button type="button" className="btn btn-primary py-2 position-absolute top-0 end-0 mt-2 me-2 border-0">Sign Up</button>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="copyright">
            <div className="row">
              <div className="col-md-6 text-center text-md-start mb-3 mb-md-0">
                &copy; <Link className="border-bottom text-decoration-none" href="/">CyberPurview</Link>, All Rights Reserved.
              </div>
              <div className="col-md-6 text-center text-md-end">
                <div className="footer-menu">
                  <a href="" className="text-decoration-none">Home</a>
                  <a href="" className="text-decoration-none">Cookies</a>
                  <a href="" className="text-decoration-none">Help</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ─── FOOTER END ─── */}
    </>
  );
}
